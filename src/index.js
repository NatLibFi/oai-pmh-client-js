import fetch from 'node-fetch';
import moment from 'moment';
import httpStatus from 'http-status';
import {EventEmitter} from 'events';
//import {Parser as XMLParser, Builder as XMLBuilder} from 'xml2js';
import createDebugLogger from 'debug';
import {XMLParser, XMLBuilder} from 'fast-xml-parser';


export const errors = {
  badArgument: 'badArgument',
  badResumptionToken: 'badResumptionToken',
  badVerb: 'badVerb',
  cannotDisseminateFormat: 'cannotDisseminateFormat',
  idDoesNotExist: 'idDoesNotExist',
  noRecordsMatch: 'noRecordsMatch',
  noMetadataFormats: 'noMetadataFormats',
  noSetHierarchy: 'noSetHierarchy'
};

export const metadataFormats = {
  object: 'object',
  string: 'string'
};

export class OaiPmhError extends Error {
  constructor(code, ...args) {
    super(args);
    this.code = code; // eslint-disable-line functional/no-this-expressions
  }
}

export default ({
  url: baseUrl,
  apiKey = false,
  apiKeyHeader = false,
  metadataPrefix: metadataPrefixDefault,
  set: setDefault,
  metadataFormat = metadataFormats.string,
  retrieveAll = true,
  filterDeleted = false,
  cli = false,
  handleOutput = false
}) => {
  const debug = createDebugLogger('@natlibfi/oai-pmh-client');
  const formatMetadata = createFormatter();

  class Emitter extends EventEmitter {
    constructor(...args) {
      super(args);
    }
  }

  return {listRecords, verbQuery};

  async function verbQuery(verb = 'Identify') {
    const url = `${baseUrl}?verb=${verb}`;
    debug(`Sending request: ${url.toString()}`);
    const response = await doFetch(url);
    return response;
  }

  function listRecords({resumptionToken = {}, metadataPrefix: metadataPrefixArg, set: setArg} = {resumptionToken: {}}) {
    debug(`List records`);
    debug(`ResumptionToken: ${resumptionToken}`);
    const metadataPrefix = metadataPrefixArg || metadataPrefixDefault;
    const set = setArg || setDefault;
    const emitter = new Emitter();

    iterate(resumptionToken);
    return emitter;

    async function iterate({token}, iteration = 1) {
      try {
        if (token) {
          await processRequest({verb: 'ListRecords', resumptionToken: token}, iteration);
          return;
        }

        await processRequest({verb: 'ListRecords', metadataPrefix, set}, iteration);
      } catch (err) {
        return emitter.emit('error', err);
      }

      async function processRequest(parameters, iteration) {
        const url = generateUrl(parameters);
        debug(`Sending request: ${url.toString()}`);
        const response = await doFetch(url);

        if (response.status === httpStatus.OK) {
          const responseText = await response.text();

          // For cli to write file
          if (cli) { // eslint-disable-line functional/no-conditional-statements
            handleOutput(responseText, true, `result_${iteration}.xml`, iteration === 1);
          }

          const {records, error, resumptionToken} = await parsePayload(responseText);

          if (error) { // eslint-disable-line functional/no-conditional-statements
            throw new OaiPmhError(error);
          }


          emitRecords(records);

          if (resumptionToken) {
            if (retrieveAll) {
              return iterate(formatResumptionToken(resumptionToken), iteration + 1);
            }

            return emitter.emit('end', formatResumptionToken(resumptionToken));
          }

          return emitter.emit('end');
        }

        throw new Error(`Unexpected response ${response.status}: ${await response.text()}`);

        function formatResumptionToken(resumptionToken) {
          return {
            token: resumptionToken['#text'],
            expirationDate: moment(resumptionToken.$.expirationDate),
            cursor: Number(resumptionToken.$.cursor)
          };
        }

        async function parsePayload(responseText) {
          const payload = await parse(responseText);
          const {error} = payload['OAI-PMH'];

          if (error) {
            return {error: error.$.code};
          }

          const {
            'OAI-PMH': {
              ListRecords: {record: records, resumptionToken}
            }
          } = payload;

          return {records, resumptionToken};

          function parse(payload) {
            return new Promise((resolve, reject) => {
              try {
                const obj = new XMLParser({
                  ignoreAttributes: false,
                  attributesGroupName: '$',
                  attributeNamePrefix: ''
                }).parse(payload);
                return resolve(obj);
              } catch (err) {
                reject(new Error(`Error parsing XML: ${err}, input: ${payload}`));
              }
            });
          }
        }

        function emitRecords(records) {
          const [record, ...rest] = records;

          if (record) {
            const formatted = formatRecord();

            if (formatted.header.status === 'deleted') {
              if (filterDeleted) {
                return emitRecords(rest);
              }

              emitter.emit('record', formatted);
              return emitRecords(rest);
            }

            emitter.emit('record', {...formatted, metadata: formatMetadata(record.metadata)});
            return emitRecords(rest);
          }

          function formatRecord() {
            const obj = {
              identifier: record.header.identifier,
              datestamp: moment(record.header.datestamp)
            };

            if (record.header.$?.status) {
              return {
                header: {
                  ...obj, status: record.header.$.status
                }
              };
            }

            return {header: obj};
          }
        }

        function generateUrl(params) {
          const {resumptionToken} = params;
          params.resumptionToken = undefined; // eslint-disable-line functional/immutable-data
          const formatted = Object.entries(params)
            .filter(([, value]) => value)
            .reduce((acc, [key, value]) => ({...acc, [key]: encodeURIComponent(value)}), {});

          const searchParams = new URLSearchParams(formatted);
          if (resumptionToken !== undefined) {
            return `${baseUrl}?${searchParams.toString()}&resumptionToken=${resumptionToken}`;
          }

          return `${baseUrl}?${searchParams.toString()}`;
        }
      }
    }
  }

  async function doFetch(url) {
    if (apiKeyHeader && apiKey) {
      const headers = {};
      headers[apiKeyHeader] = apiKey; // eslint-disable-line functional/immutable-data
      headers.Accept = '*/*'; // eslint-disable-line functional/immutable-data
      headers['User-Agent'] = 'Melinda-oai-pmh-client'; // eslint-disable-line functional/immutable-data
      debug(`Request headers: ${JSON.stringify(headers)}`);
      const response = await fetch(url, {
        headers
      });

      debug(`Request response: ${JSON.stringify(response)}`);

      return response;
    }

    const response = await fetch(url);
    debug(`Request response: ${JSON.stringify(response)}`);
    return response;
  }

  function createFormatter() {
    if (metadataFormat === metadataFormats.object) {
      return metadata => metadata;
    }

    if (metadataFormat === metadataFormats.string) {
      const builder = new XMLBuilder({
        processEntities: false,
        format: true,
        indentBy: '\t',
        oneListGroup: true
      });


      return metadata => {
        const [[key, value]] = Object.entries(metadata);
        return builder.build({[key]: value});
      };
    }

    throw new Error(`Invalid metadata format: ${metadataFormat}`);
  }
};

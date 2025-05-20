import fetch from 'node-fetch';
import moment from 'moment';
import httpStatus from 'http-status';
import {EventEmitter} from 'events';
import {Parser as XMLParser, Builder as XMLBuilder} from 'xml2js';
import createDebugLogger from 'debug';
import {MARCXML} from '@natlibfi/marc-record-serializers';
import {createLogger} from '@natlibfi/melinda-backend-commons';

const logger = createLogger();

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
  string: 'string',
  marcJson: 'marcJson'
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
  filterDeleted = false
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
    debug(`ResumptionToken: ${JSON.stringify(resumptionToken)}`);
    debug(`MetadataPrefix: ${metadataPrefixArg}`);
    debug(`Set: ${setArg}`);
    const metadataPrefix = metadataPrefixArg || metadataPrefixDefault;
    const set = setArg || setDefault;
    const emitter = new Emitter();

    iterate(resumptionToken);
    return emitter;

    async function iterate({token, urlEncodeResumptionToken = false}, iteration = 1) {
      try {
        if (token) {
          await processRequest({verb: 'ListRecords', resumptionToken: token, urlEncodeResumptionToken}, iteration);
          return;
        }

        await processRequest({verb: 'ListRecords', metadataPrefix, set}, iteration);
      } catch (err) {
        return emitter.emit('error', err);
      }

      async function processRequest(parameters, iteration) {
        const url = generateUrl(baseUrl, parameters);
        logger.info(`Sending query request: ${url.toString()}`);
        const response = await doFetch(url);

        if (response.status === httpStatus.OK) {
          const responseText = await response.text();

          emitter.emit('oaiPmhResponse', {responseText, iteration});

          const {records, error, resumptionToken} = await parsePayload(responseText);

          if (error) { // eslint-disable-line functional/no-conditional-statements
            throw new OaiPmhError(error);
          }

          await emitRecords(records);

          if (resumptionToken) {
            if (retrieveAll) {
              return iterate(formatResumptionToken(resumptionToken, urlEncodeResumptionToken), iteration + 1);
            }

            return emitter.emit('end', formatResumptionToken(resumptionToken, urlEncodeResumptionToken));
          }

          return emitter.emit('end');
        }

        throw new Error(`Unexpected response ${response.status}: ${await response.text()}`);

        function generateUrl(baseUrl, params) {
          const {urlEncodeResumptionToken} = params;
          params.urlEncodeResumptionToken = undefined; // eslint-disable-line functional/immutable-data
          const formatted = Object.entries(params)
            .filter(([, value]) => value)
            .reduce((acc, [key, value]) => {
              if (key !== 'resumptionToken' || urlEncodeResumptionToken) {
                return {...acc, [key]: encodeURIComponent(value)};
              }

              return {...acc, [key]: value};
            }, {});
          const searchParams = new URLSearchParams(formatted);
          return `${baseUrl}?${searchParams.toString()}`;
        }

        function formatResumptionToken({_, $: {expirationDate, cursor}}, urlEncodeResumptionToken) {
          return {
            token: _,
            expirationDate: moment(expirationDate),
            cursor: Number(cursor),
            urlEncodeResumptionToken: Boolean(urlEncodeResumptionToken)
          };
        }

        async function parsePayload(responseText) {
          const payload = await parse(responseText);
          const {error} = payload['OAI-PMH'];

          if (error) {
            return {error: error[0].$.code};
          }

          const {
            'OAI-PMH': {
              ListRecords: [{record: records, resumptionToken}]
            }
          } = payload;

          return {records, resumptionToken: resumptionToken?.[0]};

          function parse(responseText) {
            return new Promise((resolve, reject) => {
              new XMLParser().parseString(responseText, (err, obj) => {
                if (err) {
                  return reject(new Error(`Error parsing XML: ${err}, input: ${responseText}`));
                }
                return resolve(obj);
              });
            });
          }
        }

        async function emitRecords(records) {
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

            const metadata = await formatMetadata(record.metadata[0]);
            emitter.emit('record', {...formatted, metadata});
            return emitRecords(rest);
          }

          function formatRecord() {
            const obj = {
              identifier: record.header[0].identifier[0],
              datestamp: moment(record.header[0].datestamp[0])
            };

            if (record.header[0].$?.status) {
              return {
                header: {
                  ...obj, status: record.header[0].$.status
                }
              };
            }

            return {header: obj};
          }
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
        xmldec: {
          version: '1.0',
          encoding: 'UTF-8',
          standalone: false
        },
        renderOpts: {
          pretty: true,
          indent: '\t'
        }
      });

      return metadata => {
        const [[key, value]] = Object.entries(metadata);
        return builder.buildObject({[key]: value[0]});
      };
    }

    if (metadataFormat === metadataFormats.marcJson) {
      const builder = new XMLBuilder({
        xmldec: {
          version: '1.0',
          encoding: 'UTF-8',
          standalone: false
        },
        renderOpts: {
          pretty: true,
          indent: '\t'
        }
      });

      return async metadata => {
        const [[key, value]] = Object.entries(metadata);
        const xmlString = builder.buildObject({[key]: value[0]});
        const record = await MARCXML.from(xmlString, {subfieldValues: false});
        return record;
      };
    }

    throw new Error(`Invalid metadata format: ${metadataFormat}`);
  }
};

import fetch from 'node-fetch';
import moment from 'moment';
import httpStatus from 'http-status';
import {EventEmitter} from 'events';
import {Parser as XMLParser, Builder as XMLBuilder} from 'xml2js';
import createDebugLogger from 'debug';
import {joinObjects} from './utils';

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

  return {listRecords};

  function listRecords({resumptionToken = {}, metadataPrefix: metadataPrefixArg, set: setArg, from = undefined, until = undefined} = {resumptionToken: {}}) {
    const metadataPrefix = metadataPrefixArg || metadataPrefixDefault;
    const set = setArg || setDefault;
    const emitter = new Emitter();

    iterate(resumptionToken);
    return emitter;

    async function iterate({token}) {
      try {
        if (token) {
          await processRequest({verb: 'ListRecords', resumptionToken: token});
          return;
        }

        const params = {verb: 'ListRecords', metadataPrefix, set};
        joinObjects(params, {from, until}, ['from', 'until']);

        await processRequest(params);
      } catch (err) {
        return emitter.emit('error', err);
      }

      async function processRequest(parameters) {
        console.log(JSON.stringify(parameters)); // eslint-disable-line

        const url = generateUrl(parameters);
        debug(`Sending request: ${url.toString()}`);
        const response = await fetch(url);

        if (response.status === httpStatus.OK) {
          const {records, error, resumptionToken} = await parsePayload(response);

          if (error) { // eslint-disable-line functional/no-conditional-statements
            throw new OaiPmhError(error);
          }

          emitRecords(records);

          if (resumptionToken) {
            if (retrieveAll) {
              return iterate(formatResumptionToken(resumptionToken));
            }

            return emitter.emit('end', formatResumptionToken(resumptionToken));
          }

          return emitter.emit('end');
        }

        throw new Error(`Unexpected response ${response.status}: ${await response.text()}`);

        function formatResumptionToken({_, $: {expirationDate, cursor}}) {
          return {
            token: _,
            expirationDate: moment(expirationDate),
            cursor: Number(cursor)
          };
        }

        async function parsePayload(response) {
          const payload = await parse();
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

          async function parse() {
            const payload = await response.text();

            return new Promise((resolve, reject) => {
              new XMLParser().parseString(payload, (err, obj) => {
                if (err) {
                  return reject(new Error(`Error parsing XML: ${err}, input: ${payload}`));
                }
                return resolve(obj);
              });
            });
          }
        }

        function emitRecords(records) {
          const [record] = records;

          if (record) {
            const formatted = formatRecord();

            if (formatted.header.status === 'deleted') {
              if (filterDeleted) {
                return emitRecords(records.slice(1));
              }

              emitter.emit('record', formatted);
              return emitRecords(records.slice(1));
            }

            emitter.emit('record', {...formatted, metadata: formatMetadata(record.metadata[0])});
            return emitRecords(records.slice(1));
          }

          function formatRecord() {
            const obj = {
              identifier: record.header[0].identifier[0],
              datestamp: moment(record.header[0].datestamp[0])
            };

            if (record.header[0]?.$?.status) {
              return {
                header: {
                  ...obj, status: record.header[0].$.status
                }
              };
            }

            return {header: obj};
          }
        }

        function generateUrl(params) {
          console.log(JSON.stringify(params)); // eslint-disable-line
          const formatted = Object.entries(params)
            .filter(([, value]) => value)
            .reduce((acc, [key, value]) => ({...acc, [key]: encodeURIComponent(value)}), {});

          const searchParams = new URLSearchParams(formatted);
          return `${baseUrl}?${searchParams.toString()}`;
        }
      }
    }
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

    throw new Error(`Invalid metadata format: ${metadataFormat}`);
  }
};

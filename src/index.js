/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* OAI-PMH Javascript client library
*
* Copyright (C) 2020 University Of Helsinki (The National Library Of Finland)
*
* This file is part of oai-pmh-client-js
*
* oai-pmh-client-js program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* oai-pmh-client-js is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import fetch from 'node-fetch';
import httpStatus from 'http-status';
import {EventEmitter} from 'events';
import {Parser as XMLParser, Builder as XMLBuilder} from 'xml2js';
import createDebugLogger from 'debug';

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

export const formats = {
  object: 'object',
  string: 'string'
};

export class OaiPmhError extends Error {
  constructor(error, ...args) {
    super(args);
    this.error = error; // eslint-disable-line functional/no-this-expression
  }
}

export default ({
  url: baseUrl,
  metadataPrefix: metadataPrefixDefault,
  set: setDefault,
  format = formats.object,
  retrieveAll = true
}) => {
  const debug = createDebugLogger('@natlibfi/oai-pmh-client');
  const formatRecord = createFormatter();

  class Emitter extends EventEmitter {
    constructor(...args) {
      super(args);
    }
  }

  return {listRecords};

  function listRecords({resumptionToken, metadataPrefix: metadataPrefixArg, set: setArg} = {}) {
    const metadataPrefix = metadataPrefixArg || metadataPrefixDefault;
    const set = setArg || setDefault;
    const emitter = new Emitter();

    iterate(resumptionToken);
    return emitter;

    function iterate(resumptionToken) {
      try {
        if (resumptionToken) {
          debug(resumptionToken);
          return processRequest({verb: 'ListRecords', resumptionToken});
        }

        return processRequest({verb: 'ListRecords', metadataPrefix, set});
      } catch (err) {
        emitter.emit('error', err);
      }

      async function processRequest(parameters) {
        const url = generateUrl(parameters);
        debug(`Sending request: ${url.toString()}`);
        const response = await fetch(url);

        if (response.status === httpStatus.OK) {
          const {records, error, resumptionToken} = await parsePayload(response);

          if (error) { // eslint-disable-line functional/no-conditional-statement
            throw new OaiPmhError(error);
          }

          emitRecords(records);

          if (resumptionToken) {
            if (retrieveAll) {
              return iterate(resumptionToken);
            }

            return emitter.emit('end', resumptionToken);
          }
        }

        throw new Error(`Unexpected response ${response.status}: ${await response.text()}`);

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

          return {records, resumptionToken: resumptionToken?.[0]._};

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
            const formatted = formatRecord(record);
            emitter.emit('record', formatted);
            return emitRecords(records.slice(1));
          }
        }

        function generateUrl(params) {
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
    if (format === formats.object) {
      return record => record;
    }

    if (format === formats.string) {
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

      return record => builder.buildObject({record});
    }

    throw new Error(`Invalid format: ${format}`);
  }
};

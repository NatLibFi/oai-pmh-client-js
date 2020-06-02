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

import createClient, {OaiPmhError} from '.';
import {expect} from 'chai';
import nock from 'nock';
import {READERS} from '@natlibfi/fixura';
import generateTests from './generate-tests';

generateTests({
  callback,
  useMetadataFile: true,
  path: [__dirname, '..', 'test-fixtures'],
  mocha: {
    before: () => nock.disableNetConnect(),
    after: () => nock.enableNetConnect(),
    afterEach: () => nock.cleanAll()
  },
  fixuraOptions: {
    failWhenNotFound: false,
    reader: READERS.JSON
  }
});

function callback({getFixture, getFixtures, defaultParameters, method, requests, error}) {
  const baseUrl = 'http://foo.bar';
  const expectedRecords = getFixture('expected-records.json');
  const expectedToken = getFixture('expected-token.json');

  generateNockMocks();

  let recordCount = 0; // eslint-disable-line functional/no-let
  const client = createClient({...defaultParameters, url: baseUrl});

  return new Promise((resolve, reject) => {
    client[method.name](method.parameters)
      .on('error', err => {
        try {
          if (error) {
            if (typeof error === 'object' && error.code) {
              expect(err).to.be.an.instanceOf(OaiPmhError);
              expect(err.code).to.equal(error.code);
              return resolve();
            }

            expect(err.message).to.match(new RegExp(error, 'u'));
            return resolve();
          }

          throw err;
        } catch (err) {
          reject(err);
        }
      })
      .on('record', record => {
        try {
          expect(expectedRecords[recordCount]).to.eql(format());
          recordCount++; // eslint-disable-line no-plusplus
        } catch (err) {
          reject(err);
        }

        function format() {
          return {
            ...record,
            header: {
              ...record.header,
              datestamp: record.header.datestamp.toISOString()
            }
          };
        }
      })
      .on('end', resumptionToken => {
        try {
          if (expectedToken) {
            expect(expectedToken).to.eql(format(resumptionToken));
            return resolve();
          }

          if (resumptionToken) { // eslint-disable-line functional/no-conditional-statement
            throw new Error(`Unexpected resumption token: ${resumptionToken}`);
          }

          resolve();
        } catch (err) {
          reject(err);
        }

        function format() {
          return {
            ...resumptionToken,
            expirationDate: resumptionToken.expirationDate.toISOString()
          };
        }
      });
  });

  function generateNockMocks() {
    const nockInstance = nock(baseUrl);

    if (requests) {
      const requestFixtures = getFixtures({
        components: [/^response[0-9]+\.xml$/u],
        reader: READERS.TEXT
      });

      return requests.forEach(({url, status}, index) => {
        nockInstance
          .get(url)
          .reply(status, requestFixtures[index]);
      });
    }
  }
}

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

import createClient from '.';
import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import nock from 'nock';
import generateTests from './generate-tests';
generateTests({
  callback,
  useMetadataFile: true,
  path: [__dirname, '..', 'test-fixtures'],
  afterEach: () => nock.restore(),
  fixuraOptions: {
    reader: READERS.JSON,
    failWhenNotFound: false
  }
});

function callback({getFixture, method, expectedToken, parameters}) {
  const baseUrl = 'http://foo.bar';
  const expectedRecords = [];
  const serverResponses = [getFixture('response.xml')];

  generateNockInvocation();

  let recordCount = 0; // eslint-disable-line functional/no-let
  const client = createClient({url: baseUrl});

  return new Promise((resolve, reject) => {
    client[method](parameters)
      .on('error', reject)
      .on('record', record => {
        try {
          expect(expectedRecords[recordCount]).to.eql(record);
          recordCount++; // eslint-disable-line no-plusplus
        } catch (err) {
          reject(err);
        }
      })
      .on('end', resumptionToken => {
        try {
          if (expectedToken) {
            expect(resumptionToken).to.equal(resumptionToken);
            return resolve();
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      });
  });

  function generateNockInvocation() {
    const nockInstance = nock(baseUrl);

    if (serverResponses) {
      return serverResponses.forEach((response, index) => {
        const parameters = index === 0 ? '?verb=ListRecords&metadataPrefix=foo' : `?verb=ListRecords&resumptionToken=${index}`;
        nockInstance
          .get(parameters)
          .reply(response);
      });
    }
  }
}

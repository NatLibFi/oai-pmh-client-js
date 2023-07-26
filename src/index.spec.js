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
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';


generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures'],
  fixura: {
    reader: READERS.JSON
  }
});

function callback({getFixture, defaultParameters, method, error}) {
  const expectedRecords = getFixture('expected-records.json');
  const expectedToken = getFixture('expected-token.json');

  let recordCount = 0; // eslint-disable-line functional/no-let
  const client = createClient({...defaultParameters, url: 'http://foo.bar'});

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

          if (resumptionToken) { // eslint-disable-line functional/no-conditional-statements
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
}

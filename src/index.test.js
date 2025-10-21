import createClient, {OaiPmhError} from './index.js';
import assert from 'node:assert';
//import {describe, it} from 'node:test';
//import {beforeEach} from 'node:test';
import {READERS} from '@natlibfi/fixura';
import {default as generateTests} from '@natlibfi/fixugen-http-client';


generateTests({
  callback,
  path: [import.meta.dirname, '..', 'test-fixtures'],
  fixura: {
    reader: READERS.JSON
  }
});

function callback({getFixture, defaultParameters, method, error}) {
  const expectedRecords = getFixture('expected-records.json');
  const expectedToken = getFixture('expected-token.json');

  let recordCount = 0;
  const client = createClient({...defaultParameters, url: 'http://foo.bar'});

  return new Promise((resolve, reject) => {
    client[method.name](method.parameters)
      .on('error', err => {
        try {
          if (error) {
            if (typeof error === 'object' && error.code) {
              assert(true, err instanceof OaiPmhError);
              assert.equal(err.code, error.code)
              //expect(err).to.be.an.instanceOf(OaiPmhError);
              //expect(err.code).to.equal(error.code);
              return resolve();
            }

            assert.match(err.message, new RegExp(error, 'u'));
            //expect(err.message).to.match(new RegExp(error, 'u'));
            return resolve();
          }

          throw err;
        } catch (err) {
          reject(err);
        }
      })
      .on('record', record => {
        try {
          const formatted = format();
          assert.deepEqual(formatted,expectedRecords[recordCount]);
          //expect(formatted).to.eql(expectedRecords[recordCount]);
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
            assert.deepEqual(format(resumptionToken), expectedToken);
            //expect(expectedToken).to.eql(format(resumptionToken));
            return resolve();
          }

          if (resumptionToken) {
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

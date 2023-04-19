import createClient, {OaiPmhError} from '.';
import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen-http-client';


generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'index'],
  recurse: false,
  useMetadataFile: true,
  fixura: {
    reader: READERS.JSON,
    failWhenNotFound: true
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
}

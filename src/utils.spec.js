import {expect} from 'chai';
import {READERS} from '@natlibfi/fixura';
import generateTests from '@natlibfi/fixugen';
import {joinObjects} from './utils';

generateTests({
  callback,
  path: [__dirname, '..', 'test-fixtures', 'utils'],
  recurse: false,
  useMetadataFile: true,
  fixura: {
    reader: READERS.JSON,
    failWhenNotFound: true
  }
});

function callback({getFixture, arrayOfKeysWanted = false}) {
  const originalObj = getFixture('originalObj.json');
  const objectToBeJoined = undefineValues(getFixture('ojectToBeJoined.json'));
  const resultObject = getFixture('resultObject.json');

  if (arrayOfKeysWanted) {
    joinObjects(originalObj, objectToBeJoined, arrayOfKeysWanted);
    expect(originalObj).to.eql(resultObject);
    return;
  }

  joinObjects(originalObj, objectToBeJoined);
  expect(originalObj).to.eql(resultObject);

  function undefineValues(obj) {
    Object.keys(obj).forEach(key => {
      if (obj[key] === 'undefined') {
        obj[key] = undefined; // eslint-disable-line functional/immutable-data
        return;
      }
    });

    return obj;
  }
}

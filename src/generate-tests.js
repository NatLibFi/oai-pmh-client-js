import fixtureFactory from '@natlibfi/fixura';
import {join as joinPath} from 'path';
import {readdirSync, existsSync, readFileSync} from 'fs';

export default ({
  callback,
  path,
  fixuraOptions = {},
  useMetadataFile = false,
  mocha
}) => {
  const rootDir = joinPath(...path);
  readdirSync(rootDir).forEach(dir => {
    describe(dir, () => {
      setupMochaCallbacks();

      readdirSync(joinPath(rootDir, dir)).forEach(subDir => {
        const fixtureInterface = fixtureFactory({...fixuraOptions, root: [rootDir, dir, subDir]});

        if (useMetadataFile) {
          const metadataPath = joinPath(rootDir, dir, subDir, 'metadata.json');

          if (existsSync(metadataPath)) {
            const {description, ...attributes} = JSON.parse(readFileSync(metadataPath, 'utf8'));
            return it(description, () => callback({...attributes, ...fixtureInterface}));
          }
        }

        it(subDir, () => callback(fixtureInterface));
      });

      function setupMochaCallbacks() {
        const afterCallback = mocha.after || (() => {});// eslint-disable-line no-empty-function
        const beforeCallback = mocha.before || (() => {});// eslint-disable-line no-empty-function
        const beforeEachCallback = mocha.beforeEach || (() => {});// eslint-disable-line no-empty-function
        const afterEachCallback = mocha.afterEach || (() => {});// eslint-disable-line no-empty-function

        after(afterCallback);
        before(beforeCallback);
        beforeEach(beforeEachCallback);
        afterEach(afterEachCallback);
      }
    });
  });
};

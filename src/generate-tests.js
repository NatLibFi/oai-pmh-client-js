import fixtureFactory from '@natlibfi/fixura';
import {join as joinPath} from 'path';
import {readdirSync, existsSync, readFileSync} from 'fs';

export default ({
  callback,
  path,
  fixuraOptions = {},
  useMetadataFile = false,
  afterEach: afterEachCallback
}) => {
  const rootDir = joinPath(...path);
  readdirSync(rootDir).forEach(dir => {
    describe(dir, () => {
      afterEach(afterEachCallback || (() => {})); // eslint-disable-line no-empty-function

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
    });
  });
};

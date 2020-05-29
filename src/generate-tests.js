import fixtureFactory from '@natlibfi/fixura';
import {join as joinPath} from 'path';
import {readdirSync} from 'fs';

export default (cb, ...paths) => {
  const rootDir = joinPath(...paths);
  readdirSync(rootDir).forEach(dir => {
    describe(dir, () => {
      readdirSync(joinPath(rootDir, dir)).forEach(subDir => {
        const fixtureInterface = fixtureFactory({root: [rootDir, dir, subDir]});
        it(subDir, () => cb(fixtureInterface));
      });
    });
  });
};

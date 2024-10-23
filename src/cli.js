import fs from 'fs';
import yargs from 'yargs';
import {createLogger, handleInterrupt} from '@natlibfi/melinda-backend-commons';

import createClient from './index.js';

run();

async function run() {
  const logger = createLogger();

  process
    .on('SIGINT', handleInterrupt)
    .on('unhandledRejection', handleInterrupt)
    .on('uncaughtException', handleInterrupt);

  const args = yargs(process.argv.slice(2))
    .scriptName('oai-pmh-cli')
    .wrap(yargs.terminalWidth())
    .epilog('Copyright (C) 2024 University Of Helsinki (The National Library Of Finland)')
    .usage('$0 <command> [options] (env variable info in Example.env)')
    .showHelpOnFail(true)
    .example([
      ['$ node $0/dist/cli.js identify'],
      ['$ node $0/dist/cli.js formats --file ./formats.xml'],
      ['$ node $0/dist/cli.js sets'],
      ['$ node $0/dist/cli.js sets --file ./sets.xml'],
      ['$ node $0/dist/cli.js query'],
      ['$ node $0/dist/cli.js query -f 2024-09-05'],
      ['$ node $0/dist/cli.js query -f 2024-09-05 -u 2024-09-06'],
      ['$ node $0/dist/cli.js query --file ./records.xml']
    ])
    .version()
    .env('OAI_PMH')
    .positional('command', {type: 'string', describe: 'oai-pmh command type'})
    .options({
      p: {type: 'string', default: 'melinda_marc', alias: 'metadataPrefix', describe: 'Oai-pmh record metadata prefix'},
      s: {type: 'string', default: undefined, alias: 'set', describe: 'Oai-pmh record set identifier'},
      t: {type: 'string', default: undefined, alias: 'resumptionToken', describe: 'Oai-pmh resumption token'},
      f: {type: 'string', default: undefined, alias: 'from', describe: 'Records from timestamp'},
      u: {type: 'string', default: undefined, alias: 'until', describe: 'Records until timestamp'},
      file: {type: 'string', default: false, describe: 'File name for output'},
      overWriteFile: {type: 'string', default: false, describe: 'over write file if exists'}
    })
    .check((args) => {
      const [command] = args._;
      if (command === undefined) {
        throw new Error('No command given');
      }

      return true;
    })
    .parseSync();

  logger.debug(JSON.stringify(args));
  const [command] = args._;
  const {url} = args;

  logger.debug('Reading oai-pmh url from env');
  const oaiPmhOptions = {
    url,
    metadataPrefix: args.metadataPrefix,
    set: args.set,
    metadataFormat: args.metadataFormat,
    retrieveAll: parseBoolean(args.retrieveAll),
    filterDeleted: parseBoolean(args.filterDeleted)
  };

  logger.debug(JSON.stringify(oaiPmhOptions));

  const client = createClient(oaiPmhOptions);

  if (command.toLowerCase() === 'query') {
    const queryOptions = {
      metadataPrefix: !args.metadataPrefix || args.metadataPrefix === 'false' ? false : args.metadataPrefix,
      set: !args.set || args.set === 'false' ? false : args.set,
      from: args.from,
      until: args.until,
      resumptionToken: args.resumptionToken || undefined
    };

    const query = generateUrl(queryOptions);

    const response = await client.verbQuery(query);
    return handleOutput(response.text());
  }

  if (command.toLowerCase() === 'sets') {
    const response = await client.verbQuery('ListSets');
    return handleOutput(await response.text());
  }

  if (command.toLowerCase() === 'formats') {
    const response = await client.verbQuery('ListMetadataFormats');
    return handleOutput(response.text());
  }

  const response = await client.verbQuery('Identify');
  return handleOutput(response.text());

  async function handleOutput(output) {
    const file = !args.file || args.file === 'false' ? false : args.file;
    const overWriteFile = parseBoolean(args.overWriteFile);

    if (file) {
      if (fs.existsSync(output)) {
        if (overWriteFile) {
          await fs.rm(file, {force: true});
          fs.writeFileSync(file, output);
          return;
        }

        throw new Error(`Directory ${file} already exists!`);
      }

      fs.writeFileSync(file, output);
      return;
    }

    console.log(await output); // eslint-disable-line
  }

  function generateUrl(params) {
    const formatted = Object.entries(params)
      .filter(([, value]) => value)
      .reduce((acc, [key, value]) => ({...acc, [key]: encodeURIComponent(value)}), {});

    const searchParams = new URLSearchParams(formatted);
    return `ListRecords&${searchParams.toString()}`;
  }

  function parseBoolean(value) {
    if (value === undefined) {
      return false;
    }

    if (Number.isNaN(Number(value))) {
      return value.length > 0 && !(/^(?:false)$/ui).test(value);
    }

    return Boolean(Number(value));
  }
}

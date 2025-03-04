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
      ['$ node $0/dist/cli.js formats '],
      ['$ node $0/dist/cli.js sets'],
      ['$ node $0/dist/cli.js sets'],
      ['$ node $0/dist/cli.js query'],
      ['$ node $0/dist/cli.js query -from 2024-09-05'],
      ['$ node $0/dist/cli.js query -from 2024-09-05 -until 2024-09-06'],
      ['$ node $0/dist/cli.js query -filetype xml']
    ])
    .version()
    .env('OAI_PMH')
    .positional('command', {type: 'string', describe: 'oai-pmh command type'})
    .options({
      apikey: {type: 'string', default: undefined, describe: 'Api key for Oai-pmh header'},
      apiKeyHeader: {type: 'string', default: undefined, describe: 'Header name for Oai-pmh api key'},
      file: {type: 'boolean', default: false, describe: 'Print to file. Defaults false'},
      filetype: {type: 'string', default: 'xml', describe: 'Filetype output. Defaults xml'},
      from: {type: 'string', default: undefined, describe: 'Records from timestamp'},
      metadataPrefix: {type: 'string', default: 'melinda_marc', describe: 'Oai-pmh record metadata prefix'},
      overewrite: {type: 'string', default: false, describe: 'overwrite file/folder if exists'},
      resumptionToken: {type: 'string', default: undefined, describe: 'Oai-pmh resumption token'},
      retrieveAll: {type: 'string', default: false, describe: 'Get all records from query'},
      set: {type: 'string', default: undefined, describe: 'Oai-pmh record set identifier'},
      until: {type: 'string', default: undefined, describe: 'Records until timestamp'}
    })
    .check((args) => {
      const [command] = args._;
      if (command === undefined) {
        throw new Error('No command given');
      }

      return true;
    })
    .parseSync();

  //logger.debug(JSON.stringify(args));
  const [command] = args._;
  const {url} = args;

  logger.debug('Reading oai-pmh url from env');
  const oaiPmhOptions = {
    url,
    apiKey: args.apiKey,
    apiKeyHeader: args.apiKeyHeader,
    metadataPrefix: args.metadataPrefix,
    set: args.set,
    metadataFormat: args.metadataFormat,
    retrieveAll: parseBoolean(args.retrieveAll),
    filterDeleted: parseBoolean(args.filterDeleted),
    cli: true,
    handleOutput
  };

  logger.debug(JSON.stringify(oaiPmhOptions));

  const client = createClient(oaiPmhOptions);
  const file = parseBoolean(args.file);
  const {filetype} = args;

  if (command.toLowerCase() === 'query') {
    const queryOptions = {
      metadataPrefix: parseBoolean(args.metadataPrefix),
      set: parseBoolean(args.set),
      from: args.from,
      until: args.until,
      resumptionToken: {token: args.resumptionToken || undefined}
    };

    if (oaiPmhOptions.retrieveAll) {
      const emitter = client.listRecords(queryOptions);
      await new Promise((resolve, reject) => {
        emitter
          .on('error', err => reject(err))
          .on('end', resumptionToken => resumptionToken ? null : resolve());
      });
      return;
    }

    const query = generateUrl(queryOptions);
    logger.debug(query);
    const response = await client.verbQuery(query);
    return handleOutput(await response.text(), file, generateFileName('result', filetype));
  }


  if (command.toLowerCase() === 'sets') {
    const response = await client.verbQuery('ListSets');
    return handleOutput(await response.text(), file, generateFileName('sets', filetype));
  }

  if (command.toLowerCase() === 'formats') {
    const response = await client.verbQuery('ListMetadataFormats');
    return handleOutput(await response.text(), file, generateFileName('formats', filetype));
  }

  const response = await client.verbQuery('Identify');
  return handleOutput(await response.text(), file, generateFileName('identify', filetype));

  function handleOutput(output, file, fileName = false, checkFolder = true) {
    const overwrite = parseBoolean(args.overwrite);
    const folder = './results';

    if (file) {
      console.log(`Writing to file: ${folder}/${fileName}`); // eslint-disable-line
      prepareFolder(checkFolder, folder, fileName);
      fs.writeFileSync(`${folder}/${fileName}`, output);
      return;
    }
    console.log('Output:'); // eslint-disable-line
    console.log(output); // eslint-disable-line

    function prepareFolder(checkFolder, folder, fileName) {
      if (!checkFolder) {
        return;
      }

      if (fs.existsSync(folder)) {
        if (overwrite) {
          return;
        }

        if (fs.existsSync(`${folder}/${fileName}`)) {
          throw new Error('File/files allready exist');
        }

        return;
      }

      fs.mkdirSync(folder);
      return;
    }
  }

  function generateFileName(name, type) {
    return `${name}.${type}`;
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

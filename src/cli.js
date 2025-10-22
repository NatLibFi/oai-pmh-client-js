import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {createLogger, handleInterrupt} from '@natlibfi/melinda-backend-commons';

import createClient from './index.js';

run();

// eslint-disable-next-line max-lines-per-function
async function run() {
  const logger = createLogger();
  const yargsInstance = yargs(hideBin(process.argv));

  process
    .on('SIGINT', handleInterrupt)
    .on('unhandledRejection', handleInterrupt)
    .on('uncaughtException', handleInterrupt);

  const args = yargs(process.argv.slice(2))
    .scriptName('oai-pmh-cli')
    .wrap(yargsInstance.terminalWidth())
    .epilog('Copyright (C) 2025 University Of Helsinki (The National Library Of Finland)')
    .usage('$0 <command> [options] (env variable info in Example.env)')
    .showHelpOnFail(true)
    .example([
      ['$ node $0/dist/cli.js identify'],
      ['$ node $0/dist/cli.js formats '],
      ['$ node $0/dist/cli.js sets'],
      ['$ node $0/dist/cli.js query'],
      ['$ node $0/dist/cli.js query --from 2024-09-05'],
      ['$ node $0/dist/cli.js query --from 2024-09-05 --until 2024-09-06'],
      ['$ node $0/dist/cli.js query --metadataFormat jsonMarc --writeRecordFiles true']
    ])
    .version()
    .env('OAI_PMH')
    .positional('command', {type: 'string', describe: 'oai-pmh command type'})
    .options({
      apiKey: {type: 'string', default: undefined, describe: 'Api key for Oai-pmh header'},
      apiKeyHeader: {type: 'string', default: undefined, describe: 'Header name for Oai-pmh api key'},
      writeResponseFiles: {type: 'boolean', default: true, describe: 'Print oai-pmh responses to file(s). Defaults true'},
      writeRecordFiles: {type: 'boolean', default: false, describe: 'Print oai-omh response records to files. Defaults false'},
      from: {type: 'string', default: undefined, describe: 'Records from timestamp'},
      metadataPrefix: {type: 'string', default: 'melinda_marc', describe: 'Oai-pmh record metadata prefix'},
      overwrite: {type: 'string', default: false, describe: 'overwrite file/folder if exists'},
      resumptionToken: {type: 'string', default: undefined, describe: 'Oai-pmh resumption token'},
      urlEncodeResumptionToken: {type: 'boolean', default: false, describe: 'Url encode Oai-pmh resumption token'},
      retrieveAll: {type: 'string', default: false, describe: 'Get all records from query'},
      set: {type: 'string', default: undefined, describe: 'Oai-pmh record set identifier'},
      until: {type: 'string', default: undefined, describe: 'Records until timestamp'},
      m: {alias: 'metadataFormat', type: 'string', default: 'string', describe: 'Record output schema (string (xml), object, marcJson)'}
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
  const {
    url,
    apiKey,
    apiKeyHeader,
    metadataPrefix,
    metadataFormat,
    set,
    from,
    until,
    resumptionToken
  } = args;
  const overwrite = parseBoolean(args.overwrite);
  const retrieveAll = parseBoolean(args.retrieveAll);
  const filterDeleted = parseBoolean(args.filterDeleted);
  const filterIsbnless = parseBoolean(args.filterIsbnless);
  const filterComponentRecords = parseBoolean(args.filterComponentRecords);
  const showRecordsInConsole = parseBoolean(args.showRecordsInConsole);
  const writeRecordFiles = parseBoolean(args.writeRecordFiles);
  const writeResponseFiles = parseBoolean(args.writeResponseFiles);
  const urlEncodeResumptionToken = parseBoolean(args.urlEncodeResumptionToken);

  logger.debug('Reading oai-pmh url from env');
  const oaiPmhOptions = {
    url,
    apiKey,
    apiKeyHeader,
    metadataPrefix,
    set,
    metadataFormat,
    retrieveAll,
    filterDeleted,
    filterIsbnless,
    filterComponentRecords
  };

  logger.debug(`Command: ${command.toLowerCase()}`);
  logger.debug(`Print records in console: ${showRecordsInConsole}`);
  logger.debug(JSON.stringify(oaiPmhOptions));
  const client = createClient(oaiPmhOptions);

  if (command.toLowerCase() === 'sets') {
    const response = await client.verbQuery('ListSets');
    const responseText = await response.text();
    return onOaiPmhResponse({responseText, iteration: 'sets'});
  }

  if (command.toLowerCase() === 'formats') {
    logger.debug('test');
    const response = await client.verbQuery('ListMetadataFormats');
    const responseText = await response.text();
    return onOaiPmhResponse({responseText, iteration: 'formats'});
  }

  if (command.toLowerCase() === 'identify') {
    const response = await client.verbQuery('Identify');
    const responseText = await response.text();
    return onOaiPmhResponse({responseText, iteration: 'identify'});
  }

  let recordCounter = 0;

  if (command.toLowerCase() === 'query') {
    const queryOptions = {
      metadataPrefix,
      set,
      from,
      until,
      resumptionToken: {token: resumptionToken, urlEncodeResumptionToken}
    };

    const emitter = client.listRecords(queryOptions);
    await new Promise((resolve, reject) => {
      emitter
        .on('oaiPmhResponse', onOaiPmhResponse)
        .on('record', onRecord)
        .on('end', data => onEnd(data, resolve))
        .on('error', error => onError(error, reject));
    });

    return;
  }

  throw new Error('Invalid command');


  function onOaiPmhResponse({responseText, iteration}) {
    console.log(`Record ${iteration}`); // eslint-disable-line
    const folder = './responses';

    if (writeResponseFiles) {
      const fileName = formatFileName(`response_${iteration}`, 'string');
      console.log(`Writing to file: ${folder}/${fileName}`); // eslint-disable-line
      prepareFolder(folder, fileName);
      return fs.writeFileSync(`${folder}/${fileName}`, responseText);
    }

    console.log('Output:'); // eslint-disable-line
    console.log(response); // eslint-disable-line
  }

  function onRecord(record) {
    // Comment: console.log(record);
    recordCounter++; //eslint-disable-line
    console.log(`Record ${recordCounter}`); // eslint-disable-line
    const folder = './records';

    if (writeRecordFiles) {
      const fileName = formatFileName(recordCounter, metadataFormat);
      console.log(`Writing to file: ${folder}/${fileName}`); // eslint-disable-line
      prepareFolder(folder, fileName);
      const content = formatFileContent(record, metadataFormat);
      return fs.writeFileSync(`${folder}/${fileName}`, content);
    }

    if (showRecordsInConsole) {
      console.log('Output:'); // eslint-disable-line
      console.log(formatFileContent(record, metadataFormat)); // eslint-disable-line
      return;
    }
  }

  function onEnd({token, expirationDate, cursor, urlEncodeResumptionToken}, resolve) {
    console.log('********** THE END **********'); // eslint-disable-line
    console.log(`resumptionToken: ${token}`); // eslint-disable-line
    console.log(`expirationDate: ${expirationDate}`); // eslint-disable-line
    console.log(`cursor: ${cursor}`); // eslint-disable-line
    console.log(`Url encode resumptionToken: ${urlEncodeResumptionToken}`); // eslint-disable-line
    console.log('********************'); // eslint-disable-line
    resolve();
  }

  function onError(error, reject) {
    console.log(`Error: ${error}`); // eslint-disable-line
    reject(error);
  }

  function formatFileName(recordCounter, metadataFormat) {
    if (metadataFormat === 'object' || metadataFormat === 'marcJson') {
      return `${recordCounter}.json`;
    }

    return `${recordCounter}.xml`;
  }

  function formatFileContent(record, metadataFormat) {
    if (metadataFormat === 'marcJson') {
      return JSON.stringify(record.metadata.toObject(), undefined, '\t');
    }

    if (metadataFormat === 'object') {
      return JSON.stringify(record, undefined, '\t');
    }

    return record.metadata;
  }

  function prepareFolder(folder, fileName) {
    console.log(`Overwrite: ${overwrite}`); //eslint-disable-line
    if (fs.existsSync(folder)) {
      if (overwrite) {
        return;
      }

      if (!overwrite && fs.existsSync(`${folder}/${fileName}`)) {
        throw new Error(`${folder}/${fileName} already exist`);
      }

      return;
    }

    fs.mkdirSync(folder);
    return;
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

# OAI-PMH Javascript client library [![NPM Version](https://img.shields.io/npm/v/@natlibfi/oai-pmh-client.svg)](https://npmjs.org/package/@natlibfi/oai-pmh-client)

# Usage
## Retrieve all records
```js
import createClient from '@natlibfi/oai-pmh-client';
const client = createClient({url: 'https://foo.bar', metadataPrefix: 'marc'});

client.listRecords()
  .on('record', record => processRecord(string))
  .on('end', () => endProcessing())
  .on('error', err => handleError(err));
```
## Retrieve records only from the first response
```js
import createClient from '@natlibfi/oai-pmh-client';
const client = createClient({url: 'https://foo.bar', metadataPrefix: 'marc', retrieveAll: false});

client.listRecords()
  .on('record', record => processRecord(string))
  .on('end', resumptionToken => endProcessing(resumptionToken))
  .on('error', err => handleError(err));
```

And then use the returned resumption token:
```js
client.listRecords({resumptionToken})
  .on('record', record => processRecord(string))
  .on('end', resumptionToken => endProcessing(resumptionToken))
  .on('error', err => handleError(err));
```

If you need sru responses
```js
client.listRecords()
  .on('oaiPmhResponse', responseText => processResponse(responseText));
```


# Configuration
## Client creation options
- **url**: The URL of the OAI-PMH service.
- **metadataPrefix**: Metadata prefix to use. **Mandatory**.
- **set**: Set to use.
- **metadataFormat**: Format of the metadata argument in **record** event. Defaults to **string** (See export **metadataFormats**)
- **retrieveAll**: Whether to retrieve all records or just from the first response. If **false**, the **end** event returns the resumptionToken.
- **filterDeleted**: Whether to filter out deleted records. Defaults to **false**.
## listRecords options:
- **metadataPrefix**: Override default metadata prefix.
- **set**: Override default set.
- **resumptionToken**: Resumption to use to resume the harvesting from.
## Cli env options
- **Check example.env**

## License and copyright

Copyright (c) 2020, 2023-2025 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **MIT** or any later version.

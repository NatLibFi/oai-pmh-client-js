/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* OAI-PMH Javascript client library
*
* Copyright (C) 2020 University Of Helsinki (The National Library Of Finland)
*
* This file is part of oai-pmh-client-js
*
* oai-pmh-client-js program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* oai-pmh-client-js is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import generateTests from './generate-tests';
generateTests(callback, __dirname, '..', 'test-fixtures'); // eslint-disable-line no-console

function callback({getFixture}) {
  console.log(getFixture(['input.json'])); // eslint-disable-line no-console
}

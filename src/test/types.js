const tap = require('tap');
const ZongJi = require('../');
const expectEvents = require('./helpers/expectEvents');
const testDb = require('./helpers');
const settings = require('./settings/mysql');
const strRepeat = testDb.strRepeat;


// @param {string} name - unique identifier of this test [a-zA-Z0-9]
// @param {[string]} fields - MySQL field description e.g. `BIGINT NULL`
// @param {[[any]]} testRows - 2D array of rows and fields to insert and test
// @param {func} customTest - optional, instead of exact row check
function defineTypeTest(name, fields, testRows, customTest) {
	const TEST_TABLE = 'type_' + name;
	const fieldText = fields.map((field, index) => `col${index} ${field}`).join(',');
	const insertColumns = fields.map((field, index) => 'col' + index).join(',');
	const testQueries = [
		`CREATE TABLE ${TEST_TABLE} (${fieldText})`,
		'SET @@session.time_zone = "+00:00"']
		.concat(
			testRows.map(row => `INSERT INTO ${TEST_TABLE}
				(${insertColumns}) VALUES
				(${row.map(field => field === null ? 'null' : field).join(',')})`
			)
		)
		.concat([
			'SET @@session.time_zone = "SYSTEM"',
			`SELECT * FROM ${TEST_TABLE}`,
		]);

		tap.test('Initialise testing db', test => {
			testDb.init(err => {
				if (err) {
					return test.fail(err);
				}

				test.end();
			});
		});

		tap.test(name, test => {
			const eventLog = [];
			const errorLog = [];

			const zongji = new ZongJi(settings.connection);
			test.teardown(() => zongji.stop());

			zongji.start({
				includeEvents: ['tablemap', 'writerows', 'updaterows', 'deleterows'],
				serverId: testDb.serverId(),
			});
			zongji.on('binlog', event => eventLog.push(event));
			zongji.on('error', error => errorLog.push(error));
			zongji.on('ready', () => {
				testDb.execute(testQueries, (error, results) => {
					if (error) {
						return test.fail(error);
					}
					const selectResult = results[results.length - 1];
					const expectedWrite = {
						_type: 'WriteRows',
						_checkTableMap: (test, event) => {
							const tableDetails = event.tableMap[event.tableId];
							test.same(tableDetails.parentSchema, testDb.SCHEMA_NAME);
							test.same(tableDetails.tableName, TEST_TABLE);
						}
					};

					expectEvents(test, eventLog, [
						{
							_type: 'TableMap',
							tableName: TEST_TABLE,
							schemaName: testDb.SCHEMA_NAME,
						},
						expectedWrite
					], testRows.length, () => {
						test.equal(errorLog.length, 0);

						const binlogRows = eventLog.reduce((prev, curr) => {
							if (curr.getTypeName() === 'WriteRows') {
								prev = prev.concat(curr.rows);
							}
							return prev;
						}, []);

						if (customTest) {
							customTest.bind(selectResult)(test, { rows: binlogRows });
						} else {
							test.same(selectResult, binlogRows);
						}

						test.end();
					});
				});
			});
		});
}

// Begin test case definitions

defineTypeTest('set', [
	'SET(' +
		"'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', " +
		"'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', " +
		"'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'i2', 'j2', 'k2', " +
		"'l2', 'm2', 'n2', 'o2', 'p2', 'q2', 'r2', 's2', 't2', 'u2', 'v2', " +
		"'w2', 'x2', 'y2', 'z2')",
	"SET('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm')"
], [
	["'a,d'", "'a,d'"],
	["'d,a,b'", "'d,a,b'"],
	["'a,d,i,z2'", "'a,d,i,k,l,m,c'"],
	["'a,j,d'", "'a,j,d'"],
	["'d,a,p'", "'d,a,m'"],
	["''", "''"],
	[null, null]
]);

defineTypeTest('bit', [
	'BIT(64) NULL',
	'BIT(32) NULL',
], [
	["b'111'", "b'111'"],
	["b'100000'", "b'100000'"],
	[
		// 64th position
		"b'1000000000000000000000000000000000000000000000000000000000000000'",
		// 32nd position
		"b'10000000000000000000000000000000'"
	],
	[null, null]
]);

defineTypeTest('enum', [
	'ENUM(' +
		"'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', " +
		"'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', " +
		"'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'i2', 'j2', 'k2', " +
		"'l2', 'm2', 'n2', 'o2', 'p2', 'q2', 'r2', 's2', 't2', 'u2', 'v2', " +
		"'w2', 'x2', 'y2', 'z2')",
	"ENUM('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm')"
], [
	["'a'", "'b'"],
	["'z2'", "'l'"],
	[null, null]
]);

defineTypeTest('int_signed', [
	'INT SIGNED NULL',
	'BIGINT SIGNED NULL',
	'TINYINT SIGNED NULL',
	'SMALLINT SIGNED NULL',
	'MEDIUMINT SIGNED NULL'
], [
	[2147483647, 9007199254740992, 127, 32767, 8388607],
	[-2147483648, -9007199254740992, -128, -32768, -8388608],
	[-2147483645, -9007199254740990, -126, -32766, -8388606],
	[-1, -1, -1, -1, -1],
	[123456, 100, 96, 300, 1000],
	[-123456, -100, -96, -300, -1000]
]);

defineTypeTest('int_unsigned', [
	'INT UNSIGNED NULL',
	'BIGINT UNSIGNED NULL',
	'TINYINT UNSIGNED NULL',
	'SMALLINT UNSIGNED NULL',
	'MEDIUMINT UNSIGNED NULL'
], [
	[4294967295, 9007199254740992, 255, 65535, 16777215],
	[1, 1, 1, 1, 1],
	[1, 8589934591, 1, 1, 1],
	[123456, 100, 96, 300, 1000]
]);

defineTypeTest('double', [
	'DOUBLE NULL'
], [
	[0], [1.0], [-1.0], [123.456], [-13.47], [0.00005], [-0.00005],
	[8589934592.123], [-8589934592.123], [null]
]);

defineTypeTest('float', [
	'FLOAT NULL'
], [
	[0], [1.0], [-1.0], [123.456], [-13.47], [3999.12]
], function(test, event) {
	// Ensure sum of differences is very low
	const diff = event.rows.reduce(function(prev, cur, index) {
		return prev + Math.abs(cur.col0 - this[index].col0);
	}.bind(this), 0);
	test.ok(diff < 0.001);
});

defineTypeTest('decimal', [
	'DECIMAL(30, 10) NULL',
	'DECIMAL(30, 20) NULL'
], [
	[1.0], [-1.0], [123.456], [-13.47],
	[123456789.123], [-123456789.123], [null],
	[1447410019.012], [123.00000123], [0.0004321]
].map(function(x) { return [ x[0], x[0] ]; }));

defineTypeTest('blob', [
	'BLOB NULL',
	'TINYBLOB NULL',
	'MEDIUMBLOB NULL',
	'LONGBLOB NULL'
], [
	["'something here'", "'tiny'", "'medium'", "'long'"],
	["'nothing there'", "'small'", "'average'", "'huge'"],
	[null, null, null, null]
]);

defineTypeTest('geometry', [
	'GEOMETRY',
], [
	["ST_GeomFromText('POINT(1 1)')"],
	["ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0),(5 5,7 5,7 7,5 7, 5 5))')"]
]);

defineTypeTest('time_no_fraction', [
	'TIME NULL'
], [
	["'-00:00:01'"],
	["'00:00:00'"],
	["'00:07:00'"],
	["'20:00:00'"],
	["'19:00:00'"],
	["'04:00:00'"],
	["'-838:59:59'"],
	["'838:59:59'"],
	["'01:07:08'"],
	["'01:27:28'"],
	["'-01:07:08'"],
	["'-01:27:28'"],
]);

defineTypeTest('datetime_no_fraction', [
	'DATETIME NULL'
], [
	["'1000-01-01 00:00:00'"],
	["'9999-12-31 23:59:59'"],
	["'2014-12-27 01:07:08'"]
]);

defineTypeTest('temporal_other', [
	'DATE NULL',
	'TIMESTAMP NULL',
	'YEAR NULL'
], [
	["'1000-01-01'", "'1970-01-01 00:00:01'", 1901],
	["'9999-12-31'", "'2038-01-18 03:14:07'", 2155],
	["'2014-12-27'", "'2014-12-27 01:07:08'", 2014]
]);

defineTypeTest('string', [
	'VARCHAR(250) NULL',
	'CHAR(20) NULL',
	'BINARY(3) NULL',
	'VARBINARY(10) NULL'
], [
	["'something here'", "'tiny'", "'a'", "'binary'"],
	["'nothing there'", "'small'", "'b'", "'test123'"],
	[null, null, null, null]
]);

defineTypeTest('text', [
	'TINYTEXT NULL',
	'MEDIUMTEXT NULL',
	'LONGTEXT NULL',
	'TEXT NULL'
], [
	["'something here'", "'tiny'", "'a'", "'binary'"],
	["'nothing there'", "'small'", "'b'", "'test123'"],
	[null, null, null, null]
]);

// ======= below require different version of MySQL =======

testDb.requireVersion('5.5.3', () => {
	defineTypeTest('utf8mb4', [
		'VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
	], [
		["'á'"], // 3 byte character
		["'𠜎'"], // 4 byte character
	]);
});

testDb.requireVersion('5.6.4', () => {
	defineTypeTest('time_fraction', [
		'TIME(0) NULL',
		'TIME(1) NULL',
		'TIME(3) NULL',
		'TIME(6) NULL'
	], [
		["'-00:00:01'", "'-00:00:01.1'", "'-00:00:01.002'", "'-00:00:01.123456'"],
		["'00:00:00'",	"'00:00:00.2'",	"'00:00:00.123'",	"'-00:00:00.000001'"],
		["'00:07:00'",	"'00:07:00.3'",	"'00:07:00.654'",	"'00:07:00.010203'"],
		["'20:00:00'",	"'20:00:00.4'",	"'20:00:00.090'",	"'20:00:00.987654'"],
		["'19:00:00'",	"'19:00:00.5'",	"'19:00:00.999'",	"'19:00:00.000001'"],
		["'04:00:00'",	"'04:00:00.0'",	"'04:00:00.01'",	"'04:00:00.1'"],
	]);

	defineTypeTest('datetime_fraction', [
		'DATETIME(0) NULL',
		'DATETIME(1) NULL',
		'DATETIME(4) NULL',
		'DATETIME(6) NULL'
	], [
		["'1000-01-01 00:00:00'", "'1000-01-01 00:00:00.5'",
			"'1000-01-01 00:00:00.9999'",	"'1000-01-01 00:00:00.123456'"],
		["'9999-12-31 23:59:59'", "'9999-12-31 23:59:59.9'",
			"'9999-12-31 23:59:59.6543'",	"'9999-12-31 23:59:59.000001'"],
		["'9999-12-31 23:59:59'", "'9999-12-31 23:59:59.1'",
			"'9999-12-31 23:59:59.1234'",	"'9999-12-31 23:59:59.4326'"	],
		["'2014-12-27 01:07:08'", "'2014-12-27 01:07:08.0'",
			"'2014-12-27 01:07:08.0001'",	"'2014-12-27 01:07:08.05'"		]
	]);

	defineTypeTest('timestamp_fractional', [
		'TIMESTAMP(3) NULL',
	], [
		["'1970-01-01 00:00:01.123'"],
		["'2038-01-18 03:14:07.900'"],
		["'2014-12-27 01:07:08.001'"],
	]);

	defineTypeTest('datetime_then_decimal', [
		'DATETIME(3) NULL',
		'DECIMAL(30, 10) NULL'
	], [
		["'1000-01-01 00:00:00.123'", 10.10],
		["'9999-12-31 23:59:59.001'", -123.45],
		["'2014-12-27 01:07:08.053'", 12345.123]
	]);
});

testDb.requireVersion('5.7.8', () => {
	defineTypeTest('json', [
		'JSON NULL'
	], [
		// Small Object
		['\'{"key1": "value1", "key2": "value2", "key3": 34}\''],
		// Small Object with nested object
		['\'{"key1": { "key2": "value2", "key3": 34 } }\''],
		// Small Object with double nested object
		['\'{"key1": { "key2": { "key2": "value2", "key3": 34 }, "key3": 34 } }\''],
		// Small Object with unicode character in key and value
		['\'{ "key2": "válue2", "keybá3": 34 }\''],
		// Large Object
		['\'{' + strRepeat('"key##": "value##", ', 2839) + '"keyLast": 34}\''],
		// Large Object with nested small objects
		['\'{' + strRepeat('"key##": {"subkey": "value##"}, ', 2000) + '"keyLast": 34}\''],
		// Large Object with nested small arrays
		['\'{' + strRepeat('"key##": ["a", ##], ', 3000) + '"keyLast": 34}\''],
		// Small array
		['\'["a", "b", 1]\''],
		// Small array with nested array
		['\'["a", [2, "b"], 1]\''],
		// Small array with double nested array
		['\'["a", [2, ["b", 4, 54]], 1]\''],
		// Large Array
		['\'[' + strRepeat('"value##", ', 6000) + '34]\''],
		// Large Array with nested small objects
		['\'[' + strRepeat('{"key##": "value##"}, ', 6000) + '34]\''],
		// Large Array with nested small arrays
		['\'[' + strRepeat('[##, "value##"], ', 6000) + '34]\''],
		// Strings of various lengths
		['\'"hello"\''],
		['\'{"twobytelen": "' + strRepeat('a', 256) + '"}\''],
		['\'{"twobytelen": "' + strRepeat('a', 257) + '"}\''],
		['\'{"twobytelen": "' + strRepeat('a', 258) + '"}\''],
		['\'{"twobytelen": "' + strRepeat('a', 7383) + '"}\''],
		['\'{"twobytelen": "' + strRepeat('a', 16383) + '"}\''],
		['\'{"threebytelen": "' + strRepeat('a', 16388) + '"}\''],
		// Integers
		['\'{"key1": -10, "keyb": 34}\''],
		['\'10\''],
		['\'2147483647\''], // Int32
		['\'-2147483647\''], // Int32
		['\'2147483648\''], // Int64
		['\'4294967295\''], // Int64
		['\'-4294967295\''], // Int64
		['\'9007199254740992\''], // UInt64
		['\'-9007199254740992\''], // Int64
		['\'3e2\''],
		['\'-3e-2\''],
		// Doubles
		['\'10.123\''],
		['\'{"doubleval": "-123.38439", "another": 1283192.0004}\''],
		// Literals
		['\'{"literaltest1": null, "literal2": true, "literal3": false}\''],
		['\'{"literaltest1": null, "stringafter": "heyos", "number": 35}\''],
		['\'null\''],
		['\'true\''],
		['\'false\''],
		// Opaque custom data
		['JSON_OBJECT(\'key\', BINARY \'hi\')'],
		['JSON_OBJECT(\'key\', MAKEDATE(2014,361))'],
		['JSON_OBJECT(\'key\', DATE(\'100-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'1000-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'1000-01-02\'))'],
		['JSON_OBJECT(\'key\', DATE(\'1000-01-03\'))'],
		['JSON_OBJECT(\'key\', DATE(\'1000-02-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'1000-12-31\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2001-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2002-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2003-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2004-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'9999-01-01\'))'],
		['JSON_OBJECT(\'key\', DATE(\'9999-12-31\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2002-02-02\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2002-03-03\'))'],
		['JSON_OBJECT(\'key\', DATE(\'2002-12-12\'))'],
		['JSON_OBJECT(\'key\', MAKETIME(-838,59,59))'],
		['JSON_OBJECT(\'key\', MAKETIME(838,59,59))'],
		['JSON_OBJECT(\'zero\', MAKETIME(0,0,0))'],
		['JSON_OBJECT(\'onehour\', MAKETIME(1,0,0))'],
		['JSON_OBJECT(\'oneminu\', MAKETIME(0,1,0))'],
		['JSON_OBJECT(\'oneseco\', MAKETIME(0,0,1))'],
		['JSON_OBJECT(\'hurnsec\', MAKETIME(1,0,1))'],
		['JSON_OBJECT(\'minnsec\', MAKETIME(0,1,1))'],
		['JSON_OBJECT(\'2minsec\', MAKETIME(0,2,2))'],
		['JSON_OBJECT(\'2min15sec\', MAKETIME(0,2,15))'],
		['JSON_OBJECT(\'2min16sec\', MAKETIME(0,2,16))'],
		['JSON_OBJECT(\'2min32sec\', MAKETIME(0,2,32))'],
		['JSON_OBJECT(\'2min59sec\', MAKETIME(0,2,59))'],
		['JSON_OBJECT(\'key\', MAKETIME(0,59,0))'],
		['JSON_OBJECT(\'key\', MAKETIME(0,0,59))'],
		['JSON_OBJECT(\'key\', MAKETIME(20,15,10))'],
		['JSON_OBJECT(\'key\', MAKETIME(21,15,10))'],
		['JSON_OBJECT(\'key\', MAKETIME(22,15,10))'],
		['JSON_OBJECT(\'oneseco\', MAKETIME(0,0,1.123))'],
		['JSON_OBJECT(\'oneseco\', MAKETIME(0,0,1.000123))'],
		['JSON_OBJECT(\'key\', MAKETIME(-20,00,00))'],
		['JSON_OBJECT(\'-59min\', TIME(\'-00:00:00.003\'))'],
		['JSON_OBJECT(\'-59min\', TIME(\'00:00:00.003\'))'],
		['JSON_OBJECT(\'-59min\', TIME(\'-00:59:59\'))'],
		['JSON_OBJECT(\'-59min\', TIME(\'-00:59:59.0003\'))'],
		['JSON_OBJECT(\'-1hr\', MAKETIME(-1,00,00))'],
		['JSON_OBJECT(\'-2hr\', MAKETIME(-2,00,00))'],
		['JSON_OBJECT(\'-1hr1sec\', MAKETIME(-1,00,1))'],
		['JSON_OBJECT(\'-1hr1sec\', MAKETIME(-1,00,0.1))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-27\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-27 01:07:08\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-27 01:07:08.123\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-27 01:07:08.000456\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-28\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2014-12-29\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2003-12-31 12:00:00\'))'],
		['JSON_OBJECT(\'key\', TIMESTAMP(\'2003-12-31 12:00:00.123\'))'],
		['JSON_OBJECT(\'key\', UNIX_TIMESTAMP(\'2015-11-13 10:20:19.012\'))'],
	], function(test, event) { // caution here , don't use arrow function
		// JSON from MySQL client has different whitespace than JSON.stringify
		// Therefore, parse and perform deep equality
		event.rows.forEach((row, index) => {
			// test.same does not work when comparison objects exceed 65536 bytes
			// Perform alternative assertions for these large cases
			const expected = JSON.parse(this[index].col0);
			const actual = JSON.parse(row.col0);
			if (this[index].col0.length > 65536) {
				// Large cases are either array or object
				if (expected instanceof Array) {
					test.equal(expected.length, actual.length);
					for (let i = 0; i < expected.length; i++) {
						test.same(expected[i], actual[i]);
					}
				} else {
					const expectedKeys = Object.keys(expected);
					const actualKeys = Object.keys(actual);
					test.equal(expectedKeys.length, actualKeys.length);
					test.same(expectedKeys, actualKeys);
					for (let j = 0; j < expectedKeys.length; j++) {
						test.same(expected[expectedKeys[j]], actual[expectedKeys[j]]);
					}
				}
			} else {
				// Comparison objects are smaller than 65536 bytes
				test.same(expected, actual);
			}
		});
	});
});

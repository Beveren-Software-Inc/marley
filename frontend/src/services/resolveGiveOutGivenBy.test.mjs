/**
 * Tests the real giver-name helper (TypeScript, no other deps).
 * Run: node --experimental-strip-types --test src/services/resolveGiveOutGivenBy.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGiveOutGivenBy } from './giveOutGivenBy.ts'

test('keeps Dr. / Mr. titles with the full name', () => {
	assert.equal(resolveGiveOutGivenBy(null, 'given by Dr. Jane Smith'), 'Dr. Jane Smith')
	assert.equal(resolveGiveOutGivenBy(null, 'Given by Mr. Omar Hassan'), 'Mr. Omar Hassan')
})

test('keeps single-letter initials', () => {
	assert.equal(resolveGiveOutGivenBy(null, 'given by A. Smith'), 'A. Smith')
	assert.equal(resolveGiveOutGivenBy(null, 'given by s/n Kurian'), 's/n Kurian')
})

test('cuts clinical text after a real sentence end', () => {
	assert.equal(resolveGiveOutGivenBy(null, 'given by Jane. Patient felt dizzy'), 'Jane')
	assert.equal(resolveGiveOutGivenBy(null, 'given by Asifa.DC on 1-10-2026'), 'Asifa')
	assert.equal(resolveGiveOutGivenBy(null, 'GIVEN BY ASIFA, DC BY DR SA'), 'ASIFA')
})

test('prefers user and respects allowNotesFallback', () => {
	assert.equal(
		resolveGiveOutGivenBy('asifa@serenehospital.com', 'given by someone else'),
		'asifa@serenehospital.com',
	)
	assert.equal(resolveGiveOutGivenBy(null, 'given by Asifa', false), '')
})

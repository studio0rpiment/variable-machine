// How `reader check` marks an answer. Run from this folder: npx tsx --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asObject, norm, same, schemaFor } from '../helper/score.ts'

test('an answer is read as JSON: the whole text, or the first {…} in it', () => {
  assert.deepEqual(asObject('{"sender":"Ada"}'), { sender: 'Ada' })
  assert.deepEqual(asObject('Here it is: {"sender":"Ada","ask":"a quote"} thanks'), { sender: 'Ada', ask: 'a quote' })
  assert.equal(asObject('no json here'), null)
  assert.equal(asObject('[1,2]'), null)
})

test('values are compared as a person would read them', () => {
  assert.equal(norm('  The   Gallery '), 'the gallery')
  assert.equal(norm('none'), '')
  assert.equal(norm('N/A'), '')
  assert.equal(norm(null), '')
  assert.equal(norm('3.0'), '3')
  assert.equal(norm(['b', 'A']), 'a|b')
})

test('a short value must match; a phrase is right when every content word of one is in the other', () => {
  assert.ok(same('Ada', 'ada'))
  assert.ok(!same('Ada', 'Bea'))
  assert.ok(same('confirm invoice paid', 'confirm the invoice was paid'))
  assert.ok(!same('meet about a new website', 'insights on building websites'))
  assert.ok(same('unknown', ''))
})

test('the stand-in is held to a schema typed from the answers', () => {
  const s = schemaFor(['sender', 'deadline', 'urgent', 'works'], [{ sender: 'Ada', deadline: null, urgent: true, works: ['a'] }, { deadline: 3 }])
  assert.deepEqual(s.required, ['sender', 'deadline', 'urgent', 'works'])
  assert.deepEqual(s.properties, { sender: { type: 'string' }, deadline: { type: 'number' }, urgent: { type: 'boolean' }, works: { type: 'array', items: { type: 'string' } } })
})

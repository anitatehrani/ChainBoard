import test from 'node:test'
import assert from 'node:assert/strict'
import {
  memberId, memberRole, avatarColor, initial, sortMembers, roleSummary,
  roleHelp, describeProjectChange, projectAuditEntries
} from './projectLogic.js'

test('member shape: old strings and new {id, role}', () => {
  assert.equal(memberId('a@b.c'), 'a@b.c')
  assert.equal(memberId({ id: 'a@b.c', role: 'admin' }), 'a@b.c')
  assert.equal(memberRole('a@b.c'), null)
  assert.equal(memberRole({ id: 'x', role: 'admin' }), 'admin')
})

test('avatarColor is stable and tolerates empty input', () => {
  assert.equal(avatarColor('a@b.c'), avatarColor('a@b.c'))
  assert.match(avatarColor('a@b.c'), /^#[0-9a-f]{6}$/)
  assert.match(avatarColor(undefined), /^#[0-9a-f]{6}$/)
})

test('initial', () => {
  assert.equal(initial('anita'), 'A')
  assert.equal(initial('  zed'), 'Z')
  assert.equal(initial(''), '?')
  assert.equal(initial(null), '?')
})

test('sortMembers: owner, admin, contributor, legacy; stable within a role', () => {
  const ms = [
    { id: 'c1', role: 'contributor' }, 'legacy', { id: 'a1', role: 'admin' },
    { id: 'c2', role: 'contributor' }, { id: 'o1', role: 'owner' }
  ]
  assert.deepEqual(sortMembers(ms).map(memberId), ['o1', 'a1', 'c1', 'c2', 'legacy'])
  assert.deepEqual(sortMembers(undefined), [])
  assert.equal(ms[0].id, 'c1') // input not mutated
})

test('roleSummary and roleHelp', () => {
  assert.deepEqual(
    roleSummary([{ id: 'a', role: 'owner' }, { id: 'b', role: 'admin' }, { id: 'c', role: 'admin' }, 'old']),
    { owner: 1, admin: 2, contributor: 0 }
  )
  assert.match(roleHelp('owner'), /full control/)
  assert.equal(roleHelp('nope'), '')
})

test('describeProjectChange', () => {
  assert.deepEqual(describeProjectChange(null, { status: 'active' }), ['Project created'])
  const base = { status: 'active', name: 'P', description: 'd', members: [{ id: 'a', role: 'owner' }] }
  assert.deepEqual(describeProjectChange(base, { ...base, status: 'archived' }), ['Archived'])
  assert.deepEqual(
    describeProjectChange(base, { ...base, members: [...base.members, { id: 'b', role: 'admin' }] }),
    ['b joined as admin']
  )
  assert.deepEqual(
    describeProjectChange(base, { ...base, members: [{ id: 'a', role: 'admin' }] }),
    ['a is now admin']
  )
  assert.deepEqual(describeProjectChange(base, { ...base, members: [] }), ['a left'])
  assert.deepEqual(describeProjectChange(base, { ...base }), ['Updated'])
  assert.deepEqual(describeProjectChange(base, { ...base, members: ['a'] }), ['Updated'])
})

test('projectAuditEntries: newest first, oldest numbered 1', () => {
  const h = [
    { txId: 'x', value: { status: 'active', members: ['a'] } },
    { txId: 'y', value: { status: 'archived', members: ['a'] } }
  ]
  const e = projectAuditEntries(h)
  assert.equal(e[0].n, 2)
  assert.deepEqual(e[0].changes, ['Archived'])
  assert.deepEqual(e[1].changes, ['Project created'])
  assert.deepEqual(projectAuditEntries(undefined), [])
})

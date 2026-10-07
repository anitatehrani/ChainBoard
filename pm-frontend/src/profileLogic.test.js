import test from 'node:test'
import assert from 'node:assert/strict'
import {
  memberSince, roleIn, profileStats, statsText, sharedProjects, teammates, accountBadges
} from './profileLogic.js'

const ME = 'me@x.io'
const PROJECTS = [
  { projectId: 'p1', name: 'Alpha', status: 'active', members: [{ id: ME, role: 'owner' }, { id: 'a@x.io', role: 'admin' }, { id: 'b@x.io', role: 'contributor' }] },
  { projectId: 'p2', name: 'Beta', status: 'active', members: [{ id: 'a@x.io', role: 'owner' }, { id: ME, role: 'admin' }] },
  { projectId: 'p3', name: 'Gamma', status: 'archived', members: [{ id: ME, role: 'contributor' }, 'legacy-id'] }
]
const DIRECTORY = [
  { email: 'a@x.io', name: 'Aria', username: 'aria' },
  { email: 'b@x.io', name: 'Ben', username: 'ben' }
]

test('memberSince', () => {
  assert.equal(memberSince('2026-10-07T09:12:00.000Z'), 'October 2026')
  assert.equal(memberSince('2026-01-01'), 'January 2026')
  assert.equal(memberSince(''), '')
  assert.equal(memberSince('2026-13-01'), '')
  assert.equal(memberSince(undefined), '')
})

test('roleIn handles objects, legacy strings and non-members', () => {
  assert.equal(roleIn(PROJECTS[0], ME), 'owner')
  assert.equal(roleIn(PROJECTS[1], ME), 'admin')
  assert.equal(roleIn(PROJECTS[2], 'legacy-id'), 'contributor')
  assert.equal(roleIn(PROJECTS[1], 'zzz'), null)
  assert.equal(roleIn(null, ME), null)
})

test('profileStats counts active by role, archived separately', () => {
  assert.deepEqual(profileStats(PROJECTS, ME), { projects: 2, archived: 1, owner: 1, admin: 1, contributor: 0 })
  assert.deepEqual(profileStats(undefined, ME), { projects: 0, archived: 0, owner: 0, admin: 0, contributor: 0 })
})

test('statsText', () => {
  assert.equal(statsText({ projects: 1, archived: 0 }), '1 active project')
  assert.equal(statsText({ projects: 2, archived: 1 }), '2 active projects · 1 archived')
})

test('sharedProjects lists the other person\'s role in each shared project', () => {
  assert.deepEqual(sharedProjects(PROJECTS, ME, 'a@x.io'), [
    { projectId: 'p1', name: 'Alpha', status: 'active', role: 'admin' },
    { projectId: 'p2', name: 'Beta', status: 'active', role: 'owner' }
  ])
  assert.deepEqual(sharedProjects(PROJECTS, ME, 'nobody@x.io'), [])
})

test('teammates: most shared first, directory names, legacy ids kept, me excluded', () => {
  const t = teammates(PROJECTS, ME, DIRECTORY)
  assert.deepEqual(t.map(x => x.email), ['a@x.io', 'b@x.io', 'legacy-id'])
  assert.equal(t[0].name, 'Aria')
  assert.equal(t[0].shared, 2)
  assert.equal(t[0].username, 'aria')
  assert.equal(t[2].name, 'legacy-id')
  assert.equal(t[2].username, '')
  assert.ok(!t.some(x => x.email === ME))
  assert.deepEqual(teammates(undefined, ME, undefined), [])
})

test('accountBadges says each state in words', () => {
  assert.deepEqual(accountBadges({ email_verified: true, has_password: true, google_linked: false }),
    ['Email confirmed', 'Password set', 'Google not connected'])
  assert.deepEqual(accountBadges({ email_verified: false, has_password: false, google_linked: true }),
    ['Email not confirmed', 'No password (Google only)', 'Google connected'])
  assert.deepEqual(accountBadges(null), [])
})

// Seed script — creates the default admin user if no users exist.
// Run with: bun run seed:auth
//
// Default admin credentials (CHANGE AFTER FIRST LOGIN):
//   Email: admin@finexfx.local
//   Password: admin123

import { db } from '../src/lib/db'
import { hashPassword, createUser } from '../src/lib/auth'

async function main() {
  console.log('🔐 Seeding default admin user...')

  const existing = await db.user.count()
  if (existing > 0) {
    console.log(`✅ ${existing} user(s) already exist — skipping seed.`)
    return
  }

  const admin = await createUser({
    email: 'admin@finexfx.local',
    name: 'Administrator',
    password: 'admin123',
    role: 'admin',
  })

  console.log('✅ Default admin user created:')
  console.log(`   Email: ${admin.email}`)
  console.log(`   Name:  ${admin.name}`)
  console.log(`   Role:  ${admin.role}`)
  console.log('')
  console.log('⚠️  IMPORTANT: Change this password after first login!')
  console.log('   Go to Settings → User Management → Reset Password')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Hardcode fallback to prevent connecting to wrong DB when env isn't loaded
const connectionString = process.env.DATABASE_URL || 'postgresql://stym06@localhost:5432/agentslack'

function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const db = createPrismaClient()

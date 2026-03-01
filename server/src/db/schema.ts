import {
  boolean,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

const EMBEDDING_DIMENSIONS = 1536;

// Custom type for bytea (binary data)
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    location: varchar('location', { length: 255 }),
    summary: text('summary'),
    rawText: text('raw_text'),
    originalFilename: varchar('original_filename', { length: 255 }),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    originalDocument: bytea('original_document'),
    documentMimeType: varchar('document_mime_type', { length: 100 }),
    ingestionCost: numeric('ingestion_cost', { precision: 10, scale: 6 }).default('0'),
    ingestionTokens: integer('ingestion_tokens').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_candidates_location').on(table.location),
  ]
);

export const experiences = pgTable(
  'experiences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    company: varchar('company', { length: 255 }),
    title: varchar('title', { length: 255 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    isCurrent: boolean('is_current').default(false),
    description: text('description'),
    location: varchar('location', { length: 255 }),
  },
  (table) => [
    index('idx_experiences_title').on(table.title),
  ]
);

export const education = pgTable(
  'education',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    institution: varchar('institution', { length: 255 }),
    degree: varchar('degree', { length: 255 }),
    fieldOfStudy: varchar('field_of_study', { length: 255 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    description: text('description'),
  }
);

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 100 }),
    proficiency: varchar('proficiency', { length: 50 }),
  },
  (table) => [
    index('idx_skills_name').on(table.name),
    index('idx_skills_category').on(table.category),
  ]
);

export const languages = pgTable(
  'languages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    proficiency: varchar('proficiency', { length: 50 }),
  }
);

export const certifications = pgTable(
  'certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    issuer: varchar('issuer', { length: 255 }),
    issueDate: date('issue_date'),
  }
);

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    errorMessage: text('error_message'),
    ingestionCost: numeric('ingestion_cost', { precision: 10, scale: 6 }),
    ingestionTokens: integer('ingestion_tokens'),
    fileData: bytea('file_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_uploads_status').on(table.status),
    index('idx_uploads_created_at').on(table.createdAt),
  ]
);

export const uploadCandidates = pgTable(
  'upload_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id').references(() => uploads.id, { onDelete: 'cascade' }).notNull(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_upload_candidates_upload').on(table.uploadId),
    index('idx_upload_candidates_candidate').on(table.candidateId),
  ]
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'set null' }),
    chatSessionId: varchar('chat_session_id', { length: 100 }),
    operation: varchar('operation', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    cost: numeric('cost', { precision: 10, scale: 6 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_llm_calls_candidate').on(table.candidateId),
    index('idx_llm_calls_session').on(table.chatSessionId),
  ]
);

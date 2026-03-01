import type { ToolDefinition } from '../llm/types';

export const searchTools: ToolDefinition[] = [
  {
    name: 'search_by_skills',
    description: 'Search for candidates who have specific skills. Returns candidates matching the given skill names.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skill names to search for (e.g., ["JavaScript", "Python", "React"])',
        },
        min_years_experience: {
          type: 'number',
          description: 'Minimum total years of professional experience',
        },
      },
      required: ['skills'],
    },
  },
  {
    name: 'search_by_experience',
    description: 'Search for candidates by their work experience — job title, company, or minimum years.',
    parameters: {
      type: 'object',
      properties: {
        job_title: {
          type: 'string',
          description: 'Job title to search for (partial match)',
        },
        min_years: {
          type: 'number',
          description: 'Minimum years in this type of role',
        },
        company: {
          type: 'string',
          description: 'Company name to search for (partial match)',
        },
      },
    },
  },
  {
    name: 'search_by_education',
    description: 'Search for candidates by their educational background.',
    parameters: {
      type: 'object',
      properties: {
        degree: {
          type: 'string',
          description: 'Degree type (e.g., "Bachelor", "Master", "PhD")',
        },
        field: {
          type: 'string',
          description: 'Field of study (e.g., "Computer Science")',
        },
        institution: {
          type: 'string',
          description: 'Educational institution name',
        },
      },
    },
  },
  {
    name: 'search_by_location',
    description: 'Search for candidates by their location.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Location to search for (e.g., "Paris", "New York", "Remote")',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'semantic_search',
    description: 'Perform a semantic/fuzzy search across all candidate profiles. Good for finding candidates matching a general description or when exact keyword matching is not enough.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the ideal candidate',
        },
        limit: {
          type: 'number',
          description: 'Max number of results (default 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_candidate_detail',
    description: 'Get the full profile of a specific candidate including all experiences, education, skills, languages, and certifications.',
    parameters: {
      type: 'object',
      properties: {
        candidate_id: {
          type: 'string',
          description: 'The UUID of the candidate',
        },
      },
      required: ['candidate_id'],
    },
  },
  {
    name: 'list_all_candidates',
    description: 'List all candidates in the database with pagination.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default 1)',
        },
        limit: {
          type: 'number',
          description: 'Results per page (default 20)',
        },
      },
    },
  },
];

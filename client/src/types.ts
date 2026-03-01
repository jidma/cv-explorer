export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  original_filename: string | null;
  document_mime_type: string | null;
  ingestion_cost: string | null;
  ingestion_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export interface Experience {
  id: string;
  company: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  location: string | null;
}

export interface Education {
  id: string;
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
}

export interface Language {
  id: string;
  name: string;
  proficiency: string | null;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string | null;
  issue_date: string | null;
}

export interface CandidateDetail extends Candidate {
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  languages: Language[];
  certifications: Certification[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  cost?: ChatCost;
}

export interface ChatCost {
  totalCost: number;
  totalTokens: number;
}

export interface UploadCost {
  total: number;
  tokens: number;
  breakdown: Array<{
    operation: string;
    model: string;
    tokens: number;
    cost: number;
  }>;
}

export interface UploadResult {
  candidateId: string;
  message: string;
  cost?: UploadCost;
}

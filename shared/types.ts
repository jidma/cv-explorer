export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  original_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface Experience {
  id: string;
  candidate_id: string;
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
  candidate_id: string;
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export interface Skill {
  id: string;
  candidate_id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
}

export interface Language {
  id: string;
  candidate_id: string;
  name: string;
  proficiency: string | null;
}

export interface Certification {
  id: string;
  candidate_id: string;
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

export interface ExtractedCV {
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experiences: Omit<Experience, 'id' | 'candidate_id'>[];
  education: Omit<Education, 'id' | 'candidate_id'>[];
  skills: Omit<Skill, 'id' | 'candidate_id'>[];
  languages: Omit<Language, 'id' | 'candidate_id'>[];
  certifications: Omit<Certification, 'id' | 'candidate_id'>[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UploadResponse {
  candidateId: string;
  status: 'processing' | 'completed' | 'error';
  message: string;
}

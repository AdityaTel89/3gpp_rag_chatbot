export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      spec_chunks: {
        Row: {
          id: string
          spec_id: string
          release: string
          clause_number: string
          clause_title: string | null
          page_number: number | null
          chunk_index: number
          text: string
          char_count: number | null
          embedding: string | null
          fts: unknown | null
          created_at: string | null
        }
        Insert: {
          id?: string
          spec_id: string
          release: string
          clause_number: string
          clause_title?: string | null
          page_number?: number | null
          chunk_index: number
          text: string
          char_count?: number | null
          embedding?: string | null
          fts?: unknown | null
          created_at?: string | null
        }
        Update: {
          id?: string
          spec_id?: string
          release?: string
          clause_number?: string
          clause_title?: string | null
          page_number?: number | null
          chunk_index?: number
          text?: string
          char_count?: number | null
          embedding?: string | null
          fts?: unknown | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks_vector: {
        Args: {
          query_embedding: string
          match_limit?: number
        }
        Returns: {
          id: string
          spec_id: string
          release: string
          clause_number: string
          clause_title: string
          page_number: number
          chunk_index: number
          text: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

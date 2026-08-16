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
      clause_references: {
        Row: {
          id: string
          source_chunk_id: string | null
          referenced_spec_id: string
          referenced_clause_number: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          source_chunk_id?: string | null
          referenced_spec_id: string
          referenced_clause_number?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          source_chunk_id?: string | null
          referenced_spec_id?: string
          referenced_clause_number?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_references_source_chunk_id_fkey"
            columns: ["source_chunk_id"]
            isOneToOne: false
            referencedRelation: "spec_chunks"
            referencedColumns: ["id"]
          }
        ]
      }
      spec_acronyms: {
        Row: {
          id: string
          spec_id: string
          acronym: string
          expansion: string
          created_at: string | null
        }
        Insert: {
          id?: string
          spec_id: string
          acronym: string
          expansion: string
          created_at?: string | null
        }
        Update: {
          id?: string
          spec_id?: string
          acronym?: string
          expansion?: string
          created_at?: string | null
        }
        Relationships: []
      }
      spec_chunks: {
        Row: {
          id: string
          spec_id: string
          release: string
          spec_version: string
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
          spec_version?: string
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
          spec_version?: string
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
          filter_spec_id?: string
          filter_spec_version?: string
        }
        Returns: {
          id: string
          spec_id: string
          release: string
          spec_version: string
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

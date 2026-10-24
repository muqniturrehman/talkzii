// =============================================================================
// GENERATED FILE — do not edit by hand.
// Regenerate offline from the migrations:   pnpm db:types:local
// Or from a live Supabase project:          pnpm db:types   (needs SUPABASE_PROJECT_ID)
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
      ai_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          token_count: number | null
          workspace_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          token_count?: number | null
          workspace_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          token_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_document_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_documents: {
        Row: {
          chunk_count: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          mime_type: string | null
          source_type: string
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          mime_type?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          mime_type?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          id: number
          ip_address: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: never
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: never
          ip_address?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan: Database["public"]["Enums"]["plan_tier"]
          provider: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          attempts: number
          broadcast_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_code: number | null
          error_message: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          message_id: string | null
          next_attempt_at: string | null
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          updated_at: string
          variables: Json
          wa_id: string
          wamid: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          broadcast_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          message_id?: string | null
          next_attempt_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          updated_at?: string
          variables?: Json
          wa_id: string
          wamid?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          broadcast_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          message_id?: string | null
          next_attempt_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          updated_at?: string
          variables?: Json
          wa_id?: string
          wamid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          estimated_cost: number | null
          failed_count: number
          id: string
          locked_until: string | null
          name: string
          paused_reason: string | null
          phone_number_id: string | null
          read_count: number
          replied_count: number
          scheduled_at: string | null
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["broadcast_status"]
          template_id: string | null
          template_language: string | null
          template_name: string | null
          total_recipients: number
          updated_at: string
          variable_mapping: Json
          workspace_id: string
        }
        Insert: {
          audience?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          estimated_cost?: number | null
          failed_count?: number
          id?: string
          locked_until?: string | null
          name: string
          paused_reason?: string | null
          phone_number_id?: string | null
          read_count?: number
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mapping?: Json
          workspace_id: string
        }
        Update: {
          audience?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          estimated_cost?: number | null
          failed_count?: number
          id?: string
          locked_until?: string | null
          name?: string
          paused_reason?: string | null
          phone_number_id?: string | null
          read_count?: number
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          variable_mapping?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_replies: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          shortcut: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canned_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canned_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          graph: Json
          id: string
          name: string
          phone_number_id: string | null
          priority: number
          published_at: string | null
          status: Database["public"]["Enums"]["chatbot_status"]
          trigger: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph?: Json
          id?: string
          name: string
          phone_number_id?: string | null
          priority?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["chatbot_status"]
          trigger?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          graph?: Json
          id?: string
          name?: string
          phone_number_id?: string | null
          priority?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["chatbot_status"]
          trigger?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          contact_id: string
          conversation_id: string
          created_at: string
          current_node_id: string | null
          expires_at: string | null
          flow_id: string
          id: string
          last_interaction_at: string
          status: Database["public"]["Enums"]["chatbot_session_status"]
          step_count: number
          updated_at: string
          variables: Json
          workspace_id: string
        }
        Insert: {
          contact_id: string
          conversation_id: string
          created_at?: string
          current_node_id?: string | null
          expires_at?: string | null
          flow_id: string
          id?: string
          last_interaction_at?: string
          status?: Database["public"]["Enums"]["chatbot_session_status"]
          step_count?: number
          updated_at?: string
          variables?: Json
          workspace_id: string
        }
        Update: {
          contact_id?: string
          conversation_id?: string
          created_at?: string
          current_node_id?: string | null
          expires_at?: string | null
          flow_id?: string
          id?: string
          last_interaction_at?: string
          status?: Database["public"]["Enums"]["chatbot_session_status"]
          step_count?: number
          updated_at?: string
          variables?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_labels: {
        Row: {
          contact_id: string
          created_at: string
          label_id: string
          workspace_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          label_id: string
          workspace_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          label_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_labels_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          id: string
          last_inbound_at: string | null
          last_seen_at: string | null
          locale: string | null
          name: string | null
          opt_out_reason: string | null
          opted_out: boolean
          opted_out_at: string | null
          phone: string | null
          profile_name: string | null
          source: string
          updated_at: string
          wa_id: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          id?: string
          last_inbound_at?: string | null
          last_seen_at?: string | null
          locale?: string | null
          name?: string | null
          opt_out_reason?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          phone?: never
          profile_name?: string | null
          source?: string
          updated_at?: string
          wa_id: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          id?: string
          last_inbound_at?: string | null
          last_seen_at?: string | null
          locale?: string | null
          name?: string | null
          opt_out_reason?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          phone?: never
          profile_name?: string | null
          source?: string
          updated_at?: string
          wa_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          conversation_id: string
          created_at: string
          label_id: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          label_id: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          label_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          awaiting_reply_since: string | null
          bot_paused: boolean
          category: Database["public"]["Enums"]["conversation_category"] | null
          contact_id: string
          created_at: string
          csat_comment: string | null
          csat_score: number | null
          expires_at: string | null
          first_response_at: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_direction: Database["public"]["Enums"]["message_direction"] | null
          last_message_preview: string | null
          meta_conversation_expires_at: string | null
          meta_conversation_id: string | null
          phone_number_id: string
          resolved_at: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          awaiting_reply_since?: string | null
          bot_paused?: boolean
          category?: Database["public"]["Enums"]["conversation_category"] | null
          contact_id: string
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          expires_at?: string | null
          first_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: Database["public"]["Enums"]["message_direction"] | null
          last_message_preview?: string | null
          meta_conversation_expires_at?: string | null
          meta_conversation_id?: string | null
          phone_number_id: string
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          awaiting_reply_since?: string | null
          bot_paused?: boolean
          category?: Database["public"]["Enums"]["conversation_category"] | null
          contact_id?: string
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          expires_at?: string | null
          first_response_at?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: Database["public"]["Enums"]["message_direction"] | null
          last_message_preview?: string | null
          meta_conversation_expires_at?: string | null
          meta_conversation_id?: string | null
          phone_number_id?: string
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          confirmation_code: string
          contact_id: string | null
          details: Json
          email: string | null
          id: string
          meta_user_id: string | null
          requested_at: string
          source: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          confirmation_code: string
          contact_id?: string | null
          details?: Json
          email?: string | null
          id?: string
          meta_user_id?: string | null
          requested_at?: string
          source: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          confirmation_code?: string
          contact_id?: string | null
          details?: Json
          email?: string | null
          id?: string
          meta_user_id?: string | null
          requested_at?: string
          source?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_deletion_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          credentials_encrypted: string | null
          id: string
          incoming_secret_encrypted: string | null
          last_event_at: string | null
          name: string
          provider: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string | null
          id?: string
          incoming_secret_encrypted?: string | null
          last_event_at?: string | null
          name: string
          provider: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string | null
          id?: string
          incoming_secret_encrypted?: string | null
          last_event_at?: string | null
          name?: string
          provider?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string | null
          body: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          mentions: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          approved_at: string | null
          category: string
          components: Json
          created_at: string
          created_by: string | null
          id: string
          language: string
          last_synced_at: string | null
          meta_template_id: string | null
          name: string
          parameter_format: string
          quality_score: string | null
          rejected_reason: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          waba_account_id: string | null
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          category: string
          components?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          language: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          parameter_format?: string
          quality_score?: string | null
          rejected_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          waba_account_id?: string | null
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          category?: string
          components?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          parameter_format?: string
          quality_score?: string | null
          rejected_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          waba_account_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          broadcast_id: string | null
          client_message_id: string | null
          contact_id: string
          content: Json
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_code: number | null
          error_message: string | null
          failed_at: string | null
          id: string
          media: Json | null
          phone_number_id: string | null
          pricing_billable: boolean | null
          pricing_category: Database["public"]["Enums"]["conversation_category"] | null
          pricing_model: string | null
          pricing_type: string | null
          read_at: string | null
          reply_to_wamid: string | null
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          template_id: string | null
          type: Database["public"]["Enums"]["message_type"]
          updated_at: string
          wamid: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          broadcast_id?: string | null
          client_message_id?: string | null
          contact_id: string
          content?: Json
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_code?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          media?: Json | null
          phone_number_id?: string | null
          pricing_billable?: boolean | null
          pricing_category?: Database["public"]["Enums"]["conversation_category"] | null
          pricing_model?: string | null
          pricing_type?: string | null
          read_at?: string | null
          reply_to_wamid?: string | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          template_id?: string | null
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          wamid?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          broadcast_id?: string | null
          client_message_id?: string | null
          contact_id?: string
          content?: Json
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error_code?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          media?: Json | null
          phone_number_id?: string | null
          pricing_billable?: boolean | null
          pricing_category?: Database["public"]["Enums"]["conversation_category"] | null
          pricing_model?: string | null
          pricing_type?: string | null
          read_at?: string | null
          reply_to_wamid?: string | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          template_id?: string | null
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          wamid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_number_quality_events: {
        Row: {
          created_at: string
          event: string
          id: string
          messaging_limit_tier: string | null
          payload: Json
          phone_number_id: string
          quality_rating: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          messaging_limit_tier?: string | null
          payload?: Json
          phone_number_id: string
          quality_rating?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          messaging_limit_tier?: string | null
          payload?: Json
          phone_number_id?: string
          quality_rating?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_number_quality_events_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_number_quality_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          code_verification_status: string | null
          created_at: string
          display_phone_number: string
          id: string
          is_default: boolean
          is_registered: boolean
          last_synced_at: string | null
          messaging_limit_tier: string | null
          metadata: Json
          name_status: string | null
          phone_number_id: string
          platform_type: string | null
          quality_rating: string
          requested_display_name: string | null
          status: string
          throughput_level: string | null
          updated_at: string
          verified_name: string | null
          waba_account_id: string
          workspace_id: string
        }
        Insert: {
          code_verification_status?: string | null
          created_at?: string
          display_phone_number: string
          id?: string
          is_default?: boolean
          is_registered?: boolean
          last_synced_at?: string | null
          messaging_limit_tier?: string | null
          metadata?: Json
          name_status?: string | null
          phone_number_id: string
          platform_type?: string | null
          quality_rating?: string
          requested_display_name?: string | null
          status?: string
          throughput_level?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_account_id: string
          workspace_id: string
        }
        Update: {
          code_verification_status?: string | null
          created_at?: string
          display_phone_number?: string
          id?: string
          is_default?: boolean
          is_registered?: boolean
          last_synced_at?: string | null
          messaging_limit_tier?: string | null
          metadata?: Json
          name_status?: string | null
          phone_number_id?: string
          platform_type?: string | null
          quality_rating?: string
          requested_display_name?: string | null
          status?: string
          throughput_level?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_workspace_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          active_workspace_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          active_workspace_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          id: string
          metric: string
          period: string
          updated_at: string
          value: number
          workspace_id: string
        }
        Insert: {
          id?: string
          metric: string
          period: string
          updated_at?: string
          value?: number
          workspace_id: string
        }
        Update: {
          id?: string
          metric?: string
          period?: string
          updated_at?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      waba_accounts: {
        Row: {
          access_token_encrypted: string | null
          account_review_status: string | null
          business_id: string | null
          business_verification_status: string | null
          connected_by: string | null
          created_at: string
          currency: string | null
          id: string
          last_synced_at: string | null
          message_template_namespace: string | null
          metadata: Json
          name: string | null
          status: Database["public"]["Enums"]["waba_status"]
          timezone_id: string | null
          token_expires_at: string | null
          token_scopes: string[]
          updated_at: string
          waba_id: string
          webhook_subscribed: boolean
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_review_status?: string | null
          business_id?: string | null
          business_verification_status?: string | null
          connected_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          message_template_namespace?: string | null
          metadata?: Json
          name?: string | null
          status?: Database["public"]["Enums"]["waba_status"]
          timezone_id?: string | null
          token_expires_at?: string | null
          token_scopes?: string[]
          updated_at?: string
          waba_id: string
          webhook_subscribed?: boolean
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_review_status?: string | null
          business_id?: string | null
          business_verification_status?: string | null
          connected_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          last_synced_at?: string | null
          message_template_namespace?: string | null
          metadata?: Json
          name?: string | null
          status?: Database["public"]["Enums"]["waba_status"]
          timezone_id?: string | null
          token_expires_at?: string | null
          token_scopes?: string[]
          updated_at?: string
          waba_id?: string
          webhook_subscribed?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waba_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waba_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          duration_ms: number | null
          error: string | null
          event: string
          id: string
          next_attempt_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          webhook_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event: string
          id?: string
          next_attempt_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          webhook_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event?: string
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          webhook_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          signature_valid: boolean
          source: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          signature_valid?: boolean
          source: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          signature_valid?: boolean
          source?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          events: string[]
          failure_count: number
          id: string
          last_delivery_at: string | null
          last_status: number | null
          secret_encrypted: string
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          last_delivery_at?: string | null
          last_status?: number | null
          secret_encrypted: string
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          last_delivery_at?: string | null
          last_status?: number | null
          secret_encrypted?: string
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          branding: Json
          created_at: string
          custom_domain: string | null
          custom_domain_verified_at: string | null
          default_country_code: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          parent_workspace_id: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          settings: Json
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          custom_domain?: string | null
          custom_domain_verified_at?: string | null
          default_country_code?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          parent_workspace_id?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          custom_domain?: string | null
          custom_domain_verified_at?: string | null
          default_country_code?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          parent_workspace_id?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_parent_workspace_id_fkey"
            columns: ["parent_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: {
          p_invitation_id: string
          p_token_hash: string
        }
        Returns: string
      }
      analytics_cost_by_category: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
          category: Database["public"]["Enums"]["conversation_category"]
          billable: number
          total: number
        }[]
      }
      analytics_csat: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
          score: number
          responses: number
        }[]
      }
      analytics_message_volume: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
          day: string
          inbound: number
          outbound: number
        }[]
      }
      analytics_overview: {
        Args: never
        Returns: Json
      }
      analytics_response_times: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
          day: string
          avg_seconds: number
          median_seconds: number
          answered: number
          total: number
        }[]
      }
      apply_message_status: {
        Args: {
          p_wamid: string
          p_status: Database["public"]["Enums"]["message_status"]
          p_timestamp: string
          p_error_code?: number
          p_error_message?: string
          p_pricing_category?: Database["public"]["Enums"]["conversation_category"]
          p_pricing_billable?: boolean
          p_pricing_model?: string
          p_pricing_type?: string
          p_meta_conversation_id?: string
          p_meta_conversation_expires_at?: string
        }
        Returns: Json
      }
      claim_broadcast_recipients: {
        Args: {
          p_broadcast_id: string
          p_limit: number
        }
        Returns: {
          attempts: number
          broadcast_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_code: number | null
          error_message: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          message_id: string | null
          next_attempt_at: string | null
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          updated_at: string
          variables: Json
          wa_id: string
          wamid: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "broadcast_recipients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_broadcasts: {
        Args: {
          p_limit?: number
          p_lock_seconds?: number
        }
        Returns: {
          audience: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          estimated_cost: number | null
          failed_count: number
          id: string
          locked_until: string | null
          name: string
          paused_reason: string | null
          phone_number_id: string | null
          read_count: number
          replied_count: number
          scheduled_at: string | null
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["broadcast_status"]
          template_id: string | null
          template_language: string | null
          template_name: string | null
          total_recipients: number
          updated_at: string
          variable_mapping: Json
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "broadcasts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_broadcast_if_done: {
        Args: {
          p_broadcast_id: string
        }
        Returns: boolean
      }
      create_workspace: {
        Args: {
          p_name: string
          p_slug?: string
          p_timezone?: string
          p_default_country_code?: string
        }
        Returns: {
          branding: Json
          created_at: string
          custom_domain: string | null
          custom_domain_verified_at: string | null
          default_country_code: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          parent_workspace_id: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          settings: Json
          slug: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_workspace_id: {
        Args: never
        Returns: string
      }
      current_workspace_role: {
        Args: never
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
      has_workspace_role: {
        Args: {
          required: Database["public"]["Enums"]["workspace_role"]
        }
        Returns: boolean
      }
      increment_usage: {
        Args: {
          p_workspace_id: string
          p_metric: string
          p_amount?: number
          p_period?: string
        }
        Returns: undefined
      }
      is_workspace_member: {
        Args: {
          ws: string
        }
        Returns: boolean
      }
      match_document_chunks: {
        Args: {
          p_query_embedding: string
          p_match_count?: number
          p_min_similarity?: number
        }
        Returns: {
          id: string
          document_id: string
          content: string
          similarity: number
        }[]
      }
      message_status_rank: {
        Args: {
          s: Database["public"]["Enums"]["message_status"]
        }
        Returns: number
      }
      recipient_status_rank: {
        Args: {
          s: Database["public"]["Enums"]["recipient_status"]
        }
        Returns: number
      }
      record_inbound_message: {
        Args: {
          p_phone_number_id: string
          p_wa_id: string
          p_wamid: string
          p_type: Database["public"]["Enums"]["message_type"]
          p_timestamp: string
          p_profile_name?: string
          p_body?: string
          p_content?: Json
          p_media?: Json
          p_reply_to_wamid?: string
        }
        Returns: Json
      }
      record_outbound_message: {
        Args: {
          p_workspace_id: string
          p_contact_id: string
          p_phone_number_id: string
          p_type: Database["public"]["Enums"]["message_type"]
          p_sender_type: Database["public"]["Enums"]["sender_type"]
          p_body?: string
          p_content?: Json
          p_media?: Json
          p_status?: Database["public"]["Enums"]["message_status"]
          p_wamid?: string
          p_sender_id?: string
          p_template_id?: string
          p_broadcast_id?: string
          p_client_message_id?: string
          p_reply_to_wamid?: string
          p_conversation_id?: string
        }
        Returns: Json
      }
      role_rank: {
        Args: {
          r: Database["public"]["Enums"]["workspace_role"]
        }
        Returns: number
      }
      slugify: {
        Args: {
          value: string
        }
        Returns: string
      }
      switch_workspace: {
        Args: {
          p_workspace_id: string
        }
        Returns: undefined
      }
      workspace_timezone: {
        Args: never
        Returns: string
      }
    }
    Enums: {
      broadcast_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "paused"
        | "completed"
        | "cancelled"
        | "failed"
      chatbot_session_status:
        | "active"
        | "waiting"
        | "completed"
        | "handed_off"
        | "expired"
        | "failed"
      chatbot_status:
        | "draft"
        | "active"
        | "inactive"
      conversation_category:
        | "marketing"
        | "utility"
        | "authentication"
        | "service"
      conversation_status:
        | "open"
        | "pending"
        | "snoozed"
        | "resolved"
      delivery_status:
        | "pending"
        | "success"
        | "failed"
      document_status:
        | "pending"
        | "processing"
        | "ready"
        | "failed"
      integration_status:
        | "connected"
        | "disconnected"
        | "error"
      message_direction:
        | "inbound"
        | "outbound"
      message_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "received"
        | "deleted"
      message_type:
        | "text"
        | "image"
        | "video"
        | "audio"
        | "document"
        | "sticker"
        | "location"
        | "contacts"
        | "interactive"
        | "button"
        | "template"
        | "reaction"
        | "order"
        | "system"
        | "unsupported"
      plan_tier:
        | "free"
        | "pro"
        | "agency"
      recipient_status:
        | "pending"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "skipped"
      sender_type:
        | "contact"
        | "agent"
        | "bot"
        | "broadcast"
        | "api"
        | "system"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "unpaid"
      waba_status:
        | "pending"
        | "connected"
        | "disconnected"
        | "error"
      workspace_role:
        | "owner"
        | "admin"
        | "agent"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      broadcast_status: [
        "draft",
        "scheduled",
        "sending",
        "paused",
        "completed",
        "cancelled",
        "failed",
      ],
      chatbot_session_status: [
        "active",
        "waiting",
        "completed",
        "handed_off",
        "expired",
        "failed",
      ],
      chatbot_status: [
        "draft",
        "active",
        "inactive",
      ],
      conversation_category: [
        "marketing",
        "utility",
        "authentication",
        "service",
      ],
      conversation_status: [
        "open",
        "pending",
        "snoozed",
        "resolved",
      ],
      delivery_status: [
        "pending",
        "success",
        "failed",
      ],
      document_status: [
        "pending",
        "processing",
        "ready",
        "failed",
      ],
      integration_status: [
        "connected",
        "disconnected",
        "error",
      ],
      message_direction: [
        "inbound",
        "outbound",
      ],
      message_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "received",
        "deleted",
      ],
      message_type: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "sticker",
        "location",
        "contacts",
        "interactive",
        "button",
        "template",
        "reaction",
        "order",
        "system",
        "unsupported",
      ],
      plan_tier: [
        "free",
        "pro",
        "agency",
      ],
      recipient_status: [
        "pending",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "skipped",
      ],
      sender_type: [
        "contact",
        "agent",
        "bot",
        "broadcast",
        "api",
        "system",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "unpaid",
      ],
      waba_status: [
        "pending",
        "connected",
        "disconnected",
        "error",
      ],
      workspace_role: [
        "owner",
        "admin",
        "agent",
        "viewer",
      ],
    },
  },
} as const

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
      profiles: {
        Row: {
          id: string
          role: 'admin' | 'driver'
          full_name: string
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: 'admin' | 'driver'
          full_name?: string
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: 'admin' | 'driver'
          full_name?: string
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      parking_slots: {
        Row: {
          id: string
          slot_number: string
          zone: string
          status: 'available' | 'occupied' | 'reserved' | 'maintenance'
          slot_type: 'regular' | 'disabled' | 'ev_charging' | 'compact'
          device_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slot_number: string
          zone?: string
          status?: 'available' | 'occupied' | 'reserved' | 'maintenance'
          slot_type?: 'regular' | 'disabled' | 'ev_charging' | 'compact'
          device_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slot_number?: string
          zone?: string
          status?: 'available' | 'occupied' | 'reserved' | 'maintenance'
          slot_type?: 'regular' | 'disabled' | 'ev_charging' | 'compact'
          device_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      devices: {
        Row: {
          id: string
          device_name: string
          api_key: string
          slot_id: string | null
          status: 'online' | 'offline' | 'error'
          last_seen: string
          firmware_version: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          device_name: string
          api_key?: string
          slot_id?: string | null
          status?: 'online' | 'offline' | 'error'
          last_seen?: string
          firmware_version?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          device_name?: string
          api_key?: string
          slot_id?: string | null
          status?: 'online' | 'offline' | 'error'
          last_seen?: string
          firmware_version?: string
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          slot_id: string
          driver_id: string
          status: 'active' | 'completed' | 'cancelled' | 'expired'
          reserved_at: string
          expires_at: string
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slot_id: string
          driver_id: string
          status?: 'active' | 'completed' | 'cancelled' | 'expired'
          reserved_at?: string
          expires_at: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slot_id?: string
          driver_id?: string
          status?: 'active' | 'completed' | 'cancelled' | 'expired'
          reserved_at?: string
          expires_at?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

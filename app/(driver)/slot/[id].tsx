import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Database } from '@/lib/database.types';
import { ArrowLeft, MapPin, Zap } from 'lucide-react-native';

type ParkingSlot = Database['public']['Tables']['parking_slots']['Row'];

export default function SlotDetail() {
  const { id } = useLocalSearchParams();
  const [slot, setSlot] = useState<ParkingSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchSlot();

    const channel = supabase
      .channel(`slot_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'parking_slots',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setSlot(payload.new as ParkingSlot);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchSlot = async () => {
    try {
      const { data, error } = await supabase
        .from('parking_slots')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      setSlot(data);
    } catch (error) {
      console.error('Error fetching slot:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = async () => {
    if (!slot || !user) return;

    setReserving(true);
    try {
      const apiUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/reservations/create`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slot_id: slot.id,
          expires_in_minutes: 15,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create reservation');
      }

      Alert.alert('Success', 'Parking slot reserved for 15 minutes!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reserve slot');
    } finally {
      setReserving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!slot) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Slot not found</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#4CAF50';
      case 'occupied':
        return '#F44336';
      case 'reserved':
        return '#FF9800';
      case 'maintenance':
        return '#9E9E9E';
      default:
        return '#999';
    }
  };

  const getSlotTypeLabel = (type: string) => {
    switch (type) {
      case 'disabled':
        return 'Accessible Parking';
      case 'ev_charging':
        return 'EV Charging Station';
      case 'compact':
        return 'Compact Vehicle';
      default:
        return 'Regular Parking';
    }
  };

  const isAvailable = slot.status === 'available';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Slot Details</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <View style={styles.slotHeader}>
            <Text style={styles.slotNumber}>{slot.slot_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(slot.status) }]}>
              <Text style={styles.statusText}>{slot.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <MapPin size={20} color="#666" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{slot.zone}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Zap size={20} color="#666" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Slot Type</Text>
                <Text style={styles.detailValue}>{getSlotTypeLabel(slot.slot_type)}</Text>
              </View>
            </View>
          </View>

          {slot.slot_type === 'ev_charging' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>This slot includes EV charging facilities</Text>
            </View>
          )}

          {slot.slot_type === 'disabled' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>This is an accessible parking space</Text>
            </View>
          )}
        </View>

        {isAvailable ? (
          <View style={styles.reserveSection}>
            <Text style={styles.reserveTitle}>Reserve this spot</Text>
            <Text style={styles.reserveSubtitle}>Reservation valid for 15 minutes</Text>
            <TouchableOpacity
              style={[styles.reserveButton, reserving && styles.buttonDisabled]}
              onPress={handleReserve}
              disabled={reserving}
            >
              <Text style={styles.reserveButtonText}>
                {reserving ? 'Reserving...' : 'Reserve Now'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.unavailableSection}>
            <Text style={styles.unavailableText}>
              This parking slot is currently {slot.status}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  header: {
    backgroundColor: '#007AFF',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  slotNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 16,
  },
  detailsSection: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  infoBox: {
    marginTop: 16,
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
  },
  reserveSection: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reserveTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  reserveSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  reserveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  reserveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  unavailableSection: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  unavailableText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

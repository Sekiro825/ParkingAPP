import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Database } from '@/lib/database.types';
import { Clock, MapPin, X } from 'lucide-react-native';

type Reservation = Database['public']['Tables']['reservations']['Row'] & {
  parking_slots?: Database['public']['Tables']['parking_slots']['Row'];
};

export default function Reservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchReservations();

    const channel = supabase
      .channel('reservations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `driver_id=eq.${user?.id}`,
        },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchReservations = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, parking_slots(*)')
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReservations(data || []);
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (reservationId: string) => {
    Alert.alert(
      'Cancel Reservation',
      'Are you sure you want to cancel this reservation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            setCancelling(reservationId);
            try {
              const apiUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/reservations/cancel/${reservationId}`;
              const { data: { session } } = await supabase.auth.getSession();

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
              });

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'Failed to cancel reservation');
              }

              Alert.alert('Success', 'Reservation cancelled');
              fetchReservations();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel reservation');
            } finally {
              setCancelling(null);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'completed':
        return '#2196F3';
      case 'cancelled':
        return '#9E9E9E';
      case 'expired':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const renderReservation = ({ item }: { item: Reservation }) => {
    const expired = isExpired(item.expires_at);
    const canCancel = item.status === 'active' && !expired;

    return (
      <View style={styles.reservationCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.slotNumber}>{item.parking_slots?.slot_number || 'N/A'}</Text>
            <View style={styles.zoneRow}>
              <MapPin size={14} color="#666" />
              <Text style={styles.zone}>{item.parking_slots?.zone || 'N/A'}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.timeInfo}>
          <View style={styles.timeRow}>
            <Clock size={16} color="#666" />
            <Text style={styles.timeLabel}>Reserved:</Text>
            <Text style={styles.timeValue}>{formatDate(item.reserved_at)}</Text>
          </View>
          <View style={styles.timeRow}>
            <Clock size={16} color="#666" />
            <Text style={styles.timeLabel}>Expires:</Text>
            <Text style={[styles.timeValue, expired && styles.expiredText]}>
              {formatDate(item.expires_at)}
            </Text>
          </View>
        </View>

        {canCancel && (
          <TouchableOpacity
            style={[styles.cancelButton, cancelling === item.id && styles.buttonDisabled]}
            onPress={() => handleCancel(item.id)}
            disabled={cancelling === item.id}
          >
            <X size={18} color="#fff" />
            <Text style={styles.cancelButtonText}>
              {cancelling === item.id ? 'Cancelling...' : 'Cancel Reservation'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Reservations</Text>
        <Text style={styles.subtitle}>{reservations.length} total bookings</Text>
      </View>

      <FlatList
        data={reservations}
        renderItem={renderReservation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchReservations} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Clock size={48} color="#ccc" />
            <Text style={styles.emptyText}>No reservations yet</Text>
            <Text style={styles.emptySubtext}>Book a parking spot to see it here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  list: {
    padding: 16,
  },
  reservationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  slotNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zone: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 12,
  },
  timeInfo: {
    gap: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
  },
  timeValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  expiredText: {
    color: '#F44336',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F44336',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
});

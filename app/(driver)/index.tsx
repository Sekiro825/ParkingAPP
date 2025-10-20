import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';
import { MapPin, Search } from 'lucide-react-native';
import { readJson, writeJson } from '@/lib/storage';

type ParkingSlot = Database['public']['Tables']['parking_slots']['Row'];

export default function DriverHome() {
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [filteredSlots, setFilteredSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const CACHE_KEY = 'cache:parking_slots';

  useEffect(() => {
    // Load cached data first for instant UI
    (async () => {
      const cached = await readJson<ParkingSlot[]>(CACHE_KEY, []);
      if (cached.length > 0) {
        setSlots(cached);
        setFilteredSlots(cached);
        setLoading(false);
      }
      fetchSlots();
    })();

    const channel = supabase
      .channel('parking_slots_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parking_slots',
        },
        () => {
          fetchSlots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredSlots(slots);
    } else {
      const filtered = slots.filter(
        (slot) =>
          slot.slot_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          slot.zone.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSlots(filtered);
    }
  }, [searchQuery, slots]);

  const fetchSlots = async () => {
    try {
      const { data, error } = await supabase
        .from('parking_slots')
        .select('*')
        .order('slot_number');

      if (error) throw error;
      setSlots(data || []);
      setFilteredSlots(data || []);
      await writeJson(CACHE_KEY, data || []);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoading(false);
    }
  };

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
        return 'Accessible';
      case 'ev_charging':
        return 'EV Charging';
      case 'compact':
        return 'Compact';
      default:
        return 'Regular';
    }
  };

  const renderSlot = ({ item }: { item: ParkingSlot }) => (
    <TouchableOpacity
      style={styles.slotCard}
      onPress={() => router.push(`/(driver)/slot/${item.id}`)}
    >
      <View style={styles.slotHeader}>
        <Text style={styles.slotNumber}>{item.slot_number}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.slotDetails}>
        <View style={styles.detailRow}>
          <MapPin size={16} color="#666" />
          <Text style={styles.detailText}>{item.zone}</Text>
        </View>
        <Text style={styles.slotType}>{getSlotTypeLabel(item.slot_type)}</Text>
      </View>
    </TouchableOpacity>
  );

  const availableCount = slots.filter((s) => s.status === 'available').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Available Parking</Text>
        <Text style={styles.subtitle}>
          {availableCount} of {slots.length} spots available
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by slot or zone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredSlots}
        renderItem={renderSlot}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSlots} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No parking slots found</Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  slotCard: {
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
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  slotNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
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
  slotDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  slotType: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

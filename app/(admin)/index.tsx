import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';
import { Plus, X, Edit2 } from 'lucide-react-native';

type ParkingSlot = Database['public']['Tables']['parking_slots']['Row'];

export default function AdminSlots() {
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ParkingSlot | null>(null);
  const [formData, setFormData] = useState({
    slot_number: '',
    zone: '',
    status: 'available' as 'available' | 'occupied' | 'reserved' | 'maintenance',
    slot_type: 'regular' as 'regular' | 'disabled' | 'ev_charging' | 'compact',
  });

  useEffect(() => {
    fetchSlots();

    const channel = supabase
      .channel('admin_slots_changes')
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

  const fetchSlots = async () => {
    try {
      const { data, error } = await supabase
        .from('parking_slots')
        .select('*')
        .order('slot_number');

      if (error) throw error;
      setSlots(data || []);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingSlot(null);
    setFormData({
      slot_number: '',
      zone: '',
      status: 'available',
      slot_type: 'regular',
    });
    setModalVisible(true);
  };

  const openEditModal = (slot: ParkingSlot) => {
    setEditingSlot(slot);
    setFormData({
      slot_number: slot.slot_number,
      zone: slot.zone,
      status: slot.status,
      slot_type: slot.slot_type,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.slot_number || !formData.zone) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      if (editingSlot) {
        const { error } = await supabase
          .from('parking_slots')
          .update(formData)
          .eq('id', editingSlot.id);

        if (error) throw error;
        Alert.alert('Success', 'Slot updated successfully');
      } else {
        const { error } = await supabase
          .from('parking_slots')
          .insert(formData);

        if (error) throw error;
        Alert.alert('Success', 'Slot created successfully');
      }

      setModalVisible(false);
      fetchSlots();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save slot');
    }
  };

  const handleDelete = (slot: ParkingSlot) => {
    Alert.alert(
      'Delete Slot',
      `Are you sure you want to delete ${slot.slot_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('parking_slots')
                .delete()
                .eq('id', slot.id);

              if (error) throw error;
              Alert.alert('Success', 'Slot deleted successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete slot');
            }
          },
        },
      ]
    );
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

  const renderSlot = ({ item }: { item: ParkingSlot }) => (
    <View style={styles.slotCard}>
      <View style={styles.slotHeader}>
        <View>
          <Text style={styles.slotNumber}>{item.slot_number}</Text>
          <Text style={styles.zone}>{item.zone}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.slotActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
          <Edit2 size={16} color="#007AFF" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
          <X size={16} color="#F44336" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Parking Slots</Text>
          <Text style={styles.subtitle}>{slots.length} total slots</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={slots}
        renderItem={renderSlot}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSlots} />}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingSlot ? 'Edit Slot' : 'Add New Slot'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Slot Number *</Text>
              <TextInput
                style={styles.input}
                value={formData.slot_number}
                onChangeText={(text) => setFormData({ ...formData, slot_number: text })}
                placeholder="e.g., A-101"
              />

              <Text style={styles.label}>Zone *</Text>
              <TextInput
                style={styles.input}
                value={formData.zone}
                onChangeText={(text) => setFormData({ ...formData, zone: text })}
                placeholder="e.g., Zone A"
              />

              <Text style={styles.label}>Status</Text>
              <View style={styles.optionsRow}>
                {['available', 'occupied', 'reserved', 'maintenance'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.optionButton,
                      formData.status === status && styles.optionButtonActive,
                    ]}
                    onPress={() =>
                      setFormData({ ...formData, status: status as typeof formData.status })
                    }
                  >
                    <Text
                      style={[
                        styles.optionText,
                        formData.status === status && styles.optionTextActive,
                      ]}
                    >
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Slot Type</Text>
              <View style={styles.optionsRow}>
                {['regular', 'disabled', 'ev_charging', 'compact'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.optionButton,
                      formData.slot_type === type && styles.optionButtonActive,
                    ]}
                    onPress={() =>
                      setFormData({ ...formData, slot_type: type as typeof formData.slot_type })
                    }
                  >
                    <Text
                      style={[
                        styles.optionText,
                        formData.slot_type === type && styles.optionTextActive,
                      ]}
                    >
                      {type.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  zone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
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
  slotActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  editButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
  },
  deleteButtonText: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  optionButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

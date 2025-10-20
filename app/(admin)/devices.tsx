import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Database } from '@/lib/database.types';
import { Plus, X, Copy, RefreshCw } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

type Device = Database['public']['Tables']['devices']['Row'];
type ParkingSlot = Database['public']['Tables']['parking_slots']['Row'];

export default function AdminDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState({
    device_name: '',
    slot_id: '',
    status: 'offline' as 'online' | 'offline' | 'error',
    firmware_version: '1.0.0',
  });

  useEffect(() => {
    fetchDevices();
    fetchSlots();

    const channel = supabase
      .channel('admin_devices_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
        },
        () => {
          fetchDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  };

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
    }
  };

  const openAddModal = () => {
    setEditingDevice(null);
    setFormData({
      device_name: '',
      slot_id: '',
      status: 'offline',
      firmware_version: '1.0.0',
    });
    setModalVisible(true);
  };

  const openEditModal = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      device_name: device.device_name,
      slot_id: device.slot_id || '',
      status: device.status,
      firmware_version: device.firmware_version,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.device_name) {
      Alert.alert('Error', 'Please enter a device name');
      return;
    }

    try {
      const dataToSave = {
        device_name: formData.device_name,
        slot_id: formData.slot_id || null,
        status: formData.status,
        firmware_version: formData.firmware_version,
      };

      if (editingDevice) {
        const { error } = await supabase
          .from('devices')
          .update(dataToSave)
          .eq('id', editingDevice.id);

        if (error) throw error;
        Alert.alert('Success', 'Device updated successfully');
      } else {
        const { error } = await supabase
          .from('devices')
          .insert(dataToSave);

        if (error) throw error;
        Alert.alert('Success', 'Device created successfully');
      }

      setModalVisible(false);
      fetchDevices();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save device');
    }
  };

  const handleDelete = (device: Device) => {
    Alert.alert(
      'Delete Device',
      `Are you sure you want to delete ${device.device_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('devices')
                .delete()
                .eq('id', device.id);

              if (error) throw error;
              Alert.alert('Success', 'Device deleted successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete device');
            }
          },
        },
      ]
    );
  };

  const copyApiKey = async (apiKey: string) => {
    await Clipboard.setStringAsync(apiKey);
    Alert.alert('Copied', 'API key copied to clipboard');
  };

  const regenerateApiKey = (device: Device) => {
    Alert.alert(
      'Regenerate API Key',
      'This will invalidate the current API key. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const newApiKey = crypto.randomUUID();
              const { error } = await supabase
                .from('devices')
                .update({ api_key: newApiKey })
                .eq('id', device.id);

              if (error) throw error;
              Alert.alert('Success', 'API key regenerated');
              fetchDevices();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to regenerate API key');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#4CAF50';
      case 'offline':
        return '#9E9E9E';
      case 'error':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getSlotName = (slotId: string | null) => {
    if (!slotId) return 'Not assigned';
    const slot = slots.find((s) => s.id === slotId);
    return slot ? slot.slot_number : 'Unknown';
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <View style={styles.deviceCard}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.device_name}</Text>
          <Text style={styles.slotText}>Slot: {getSlotName(item.slot_id)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.deviceDetails}>
        <Text style={styles.detailLabel}>Firmware: {item.firmware_version}</Text>
        <Text style={styles.detailLabel}>Last seen: {formatDate(item.last_seen)}</Text>
      </View>

      <View style={styles.apiKeyContainer}>
        <Text style={styles.apiKeyLabel}>API Key</Text>
        <View style={styles.apiKeyRow}>
          <Text style={styles.apiKey} numberOfLines={1}>
            {item.api_key}
          </Text>
          <TouchableOpacity onPress={() => copyApiKey(item.api_key)}>
            <Copy size={18} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => regenerateApiKey(item)}>
            <RefreshCw size={18} color="#FF9800" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.deviceActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>IoT Devices</Text>
          <Text style={styles.subtitle}>{devices.length} registered devices</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDevices} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No devices registered</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingDevice ? 'Edit Device' : 'Register Device'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Device Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.device_name}
                onChangeText={(text) => setFormData({ ...formData, device_name: text })}
                placeholder="e.g., ESP32-001"
              />

              <Text style={styles.label}>Assigned Slot</Text>
              <View style={styles.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[
                      styles.slotOption,
                      !formData.slot_id && styles.slotOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, slot_id: '' })}
                  >
                    <Text
                      style={[
                        styles.slotOptionText,
                        !formData.slot_id && styles.slotOptionTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {slots.map((slot) => (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        styles.slotOption,
                        formData.slot_id === slot.id && styles.slotOptionActive,
                      ]}
                      onPress={() => setFormData({ ...formData, slot_id: slot.id })}
                    >
                      <Text
                        style={[
                          styles.slotOptionText,
                          formData.slot_id === slot.id && styles.slotOptionTextActive,
                        ]}
                      >
                        {slot.slot_number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.label}>Status</Text>
              <View style={styles.optionsRow}>
                {['online', 'offline', 'error'].map((status) => (
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

              <Text style={styles.label}>Firmware Version</Text>
              <TextInput
                style={styles.input}
                value={formData.firmware_version}
                onChangeText={(text) => setFormData({ ...formData, firmware_version: text })}
                placeholder="e.g., 1.0.0"
              />

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
  deviceCard: {
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
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  slotText: {
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
  deviceDetails: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  apiKeyContainer: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  apiKeyLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
    fontWeight: '600',
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  apiKey: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
  },
  deviceActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
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
  pickerContainer: {
    marginBottom: 12,
  },
  slotOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  slotOptionActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  slotOptionText: {
    fontSize: 14,
    color: '#666',
  },
  slotOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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

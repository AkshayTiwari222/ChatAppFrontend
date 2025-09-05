// screens/HomeScreen.js

import React, { useEffect, useState, useContext, useLayoutEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Button } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../App';
import { io } from 'socket.io-client';
import { useFocusEffect } from '@react-navigation/native';

// Replace with your local IP address
const API_URL = 'http://192.168.0.107:5000'; 

const HomeScreen = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const { user, signOut } = useContext(AuthContext);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const socket = io(API_URL);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button onPress={handleSignOut} title="Logout" color="#ff3b30" />
      ),
    });
  }, [navigation, signOut]);
  
  const handleSignOut = () => {
      socket.disconnect();
      signOut();
  }

  const fetchUsers = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { 'x-auth-token': token },
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error.response ? error.response.data : error.message);
      Alert.alert('Error', 'Failed to fetch users.');
    }
  };

  // Refetch users every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [])
  );

  useEffect(() => {
    socket.on('connect', () => {
        if (user && user.id) socket.emit('addUser', user.id);
    });

    socket.on('getOnlineUsers', (onlineUserIds) => {
        setOnlineUsers(onlineUserIds);
    });
    
    // --- FEATURE: Listen for new messages to update the list in real-time ---
    socket.on('message:new', (newMessage) => {
        setUsers(currentUsers => {
            const senderId = newMessage.sender._id;
            
            // Find the user who sent the message in the current list
            const userToUpdate = currentUsers.find(u => u._id === senderId);

            if (userToUpdate) {
                // Create a new user object with the updated last message
                const updatedUser = {
                    ...userToUpdate,
                    lastMessage: {
                        text: newMessage.text,
                        createdAt: newMessage.createdAt,
                    }
                };

                // Filter out the old user object and place the updated one at the top
                const otherUsers = currentUsers.filter(u => u._id !== senderId);
                return [updatedUser, ...otherUsers];
            }
            // If the user isn't in the list, refetch everything to be safe
            fetchUsers();
            return currentUsers;
        });
    });
    // -----------------------------------------------------------------------

    return () => {
        socket.off('connect');
        socket.off('getOnlineUsers');
        socket.off('message:new');
        socket.disconnect();
    }
  }, [user]);

  const renderItem = ({ item }) => {
    const isOnline = onlineUsers.includes(item._id);
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => navigation.navigate('Chat', { userId: item._id, username: item.username })}
      >
        <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
            <Text style={styles.username}>{item.username}</Text>
            {item.lastMessage && (
                <Text style={styles.lastMessage} numberOfLines={1}>
                    {item.lastMessage.text}
                </Text>
            )}
        </View>
        <View style={styles.metaInfo}>
            {item.lastMessage && (
                <Text style={styles.timestamp}>
                    {new Date(item.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            )}
            {isOnline && <View style={styles.onlineIndicator} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={<Text style={styles.emptyText}>No users to chat with.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  userItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#075E54',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '500',
  },
  lastMessage: {
    fontSize: 14,
    color: 'grey',
    marginTop: 2,
  },
  metaInfo: {
    alignItems: 'flex-end',
  },
  timestamp: {
    fontSize: 12,
    color: 'grey',
    marginBottom: 5,
  },
  onlineIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#25D366', // WhatsApp online green
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: 'gray',
  },
});

export default HomeScreen;

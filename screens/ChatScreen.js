// screens/ChatScreen.js

import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, Alert, TouchableWithoutFeedback } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../App';
import { io } from 'socket.io-client';
import { useRoute } from '@react-navigation/native';

// Replace with your local IP address
const API_URL = 'http://192.168.0.107:5000';

// A simple component to render message status ticks
const Ticks = ({ status }) => {
    const tickColor = status === 'read' ? '#34B7F1' : 'grey'; // Blue for read, grey otherwise
    const tickSymbol = status === 'sent' ? '✓' : '✓✓';

    return <Text style={[styles.ticks, { color: tickColor }]}>{tickSymbol}</Text>;
};

const ChatScreen = () => {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null); // State to track the selected message
  const { user } = useContext(AuthContext);
  const route = useRoute();
  const { userId: recipientId, username: recipientUsername } = route.params;
  const socket = io(API_URL);
  const flatListRef = useRef();

  useEffect(() => {
    socket.on('connect', () => {
      if (user && user.id) socket.emit('addUser', user.id);
    });

    socket.on('message:new', (receivedMessage) => {
      if (receivedMessage.conversationId === conversationId) {
        setMessages(previousMessages => [receivedMessage, ...previousMessages]);
        socket.emit('message:read', { messageId: receivedMessage._id, conversationId });
      }
    });

    socket.on('message:deleted', ({ messageId }) => {
        setMessages(previousMessages => previousMessages.filter(msg => msg._id !== messageId));
    });

    socket.on('message:read:receipt', ({ messageIds }) => {
        setMessages(prevMessages => prevMessages.map(msg => 
            messageIds.includes(msg._id) ? { ...msg, status: 'read' } : msg
        ));
    });
    
    socket.on('typing:start', ({ from }) => {
        if (from === recipientId) setIsTyping(true);
    });

    socket.on('typing:stop', ({ from }) => {
        if (from === recipientId) setIsTyping(false);
    });

    const getConversation = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await axios.post(`${API_URL}/api/conversations`, 
            { recipientId },
            { headers: { 'x-auth-token': token } }
        );
        const currentConversationId = res.data._id;
        setConversationId(currentConversationId);
        
        const messagesRes = await axios.get(`${API_URL}/api/conversations/${currentConversationId}/messages`, {
            headers: { 'x-auth-token': token }
        });

        const fetchedMessages = messagesRes.data;
        setMessages(fetchedMessages.reverse());

        const unreadMessageIds = fetchedMessages
            .filter(msg => msg.sender._id === recipientId && msg.status !== 'read')
            .map(msg => msg._id);
            
        if (unreadMessageIds.length > 0) {
            socket.emit('message:read', { messageIds: unreadMessageIds, conversationId: currentConversationId });
        }

      } catch (error) {
        console.error("Failed to fetch conversation/messages", error);
      }
    };

    getConversation();
    
    return () => {
      socket.off('connect');
      socket.off('message:new');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('message:read:receipt');
      socket.off('message:deleted');
      socket.disconnect();
    };
  }, [recipientId, user.id, conversationId]);

  const onSend = useCallback(async () => {
    if (newMessage.trim().length === 0) return;
    const text = newMessage.trim();
    setNewMessage('');
    
    const token = await AsyncStorage.getItem('userToken');
    try {
        const res = await axios.post(
            `${API_URL}/api/conversations/${conversationId}/messages`,
            { text },
            { headers: { 'x-auth-token': token } }
        );

        const sentMessageServer = res.data;
        setMessages(previousMessages => [sentMessageServer, ...previousMessages]);

        socket.emit('message:send', {
            ...sentMessageServer,
            to: recipientId,
            conversationId: conversationId
        });
    } catch (error) {
        console.error("Failed to send message", error);
    }
  }, [conversationId, recipientId, newMessage, user.id]);

  const handleDeleteMessage = (messageId) => {
    Alert.alert(
        "Delete Message",
        "Delete for everyone?",
        [
            { text: "Cancel", style: "cancel", onPress: () => setSelectedMessage(null) }, // Deselect on cancel
            {
                text: "Delete",
                onPress: async () => {
                    setMessages(previousMessages => previousMessages.filter(msg => msg._id !== messageId));
                    socket.emit('message:delete', { messageId, conversationId, to: recipientId });
                    try {
                        const token = await AsyncStorage.getItem('userToken');
                        await axios.delete(`${API_URL}/api/conversations/${conversationId}/messages/${messageId}`, {
                            headers: { 'x-auth-token': token }
                        });
                    } catch (error) {
                        console.error("Failed to delete message on server", error);
                    }
                    setSelectedMessage(null); // Deselect after deleting
                },
                style: "destructive",
            },
        ]
    );
  };
  
  const handleInputTextChanged = (text) => {
    setNewMessage(text);
    if (text.length > 0) {
        socket.emit('typing:start', { to: recipientId });
    } else {
        socket.emit('typing:stop', { to: recipientId });
    }
  }

  const renderMessage = ({ item }) => {
    if (!user || !item.sender) return null; 
    const isMyMessage = item.sender._id === user.id;
    const messageTime = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSelected = selectedMessage === item._id;

    return (
      <TouchableOpacity 
        onLongPress={() => isMyMessage && setSelectedMessage(item._id)} 
        activeOpacity={0.8}
      >
        <View style={[
            styles.messageRow, 
            isMyMessage ? styles.myMessageRow : styles.theirMessageRow
        ]}>
            {/* Show delete button only if it's my message and it's selected */}
            {isMyMessage && isSelected && (
                <TouchableOpacity onPress={() => handleDeleteMessage(item._id)} style={styles.deleteButton}>
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
            )}
            <View style={[
                styles.messageContainer, 
                isMyMessage ? styles.myMessage : styles.theirMessage,
                isSelected && styles.selectedMessage // Highlight selected message
            ]}>
              <Text style={isMyMessage ? styles.myMessageText : styles.theirMessageText}>{item.text}</Text>
              <View style={styles.messageInfo}>
                  <Text style={styles.messageTime}>{messageTime}</Text>
                  {isMyMessage && <Ticks status={item.status} />}
              </View>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        {/* Wrap FlatList to deselect message on tap */}
        <TouchableWithoutFeedback onPress={() => setSelectedMessage(null)}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item._id}
              inverted
              style={styles.flatList}
              contentContainerStyle={{ paddingVertical: 10 }}
            />
        </TouchableWithoutFeedback>
        {isTyping && <Text style={styles.typingIndicator}>{`${recipientUsername} is typing...`}</Text>}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={handleInputTextChanged}
            placeholder="Type a message..."
          />
          <TouchableOpacity style={styles.sendButton} onPress={onSend}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ECE5DD', // WhatsApp-like background color
  },
  container: {
    flex: 1,
  },
  flatList: {
      flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f0f0f0',
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#075E54',
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 8,
  },
  myMessageRow: {
      justifyContent: 'flex-end',
  },
  theirMessageRow: {
      justifyContent: 'flex-start',
  },
  messageContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 4,
    borderRadius: 15,
    maxWidth: '80%',
  },
  myMessage: {
    backgroundColor: '#DCF8C6', // WhatsApp sent message color
  },
  theirMessage: {
    backgroundColor: '#FFFFFF', // WhatsApp received message color
  },
  selectedMessage: {
      backgroundColor: '#cce5ff', // Highlight color for selected message
  },
  myMessageText: {
    color: '#000',
  },
  theirMessageText: {
    color: '#000',
  },
  messageInfo: {
      flexDirection: 'row',
      alignSelf: 'flex-end',
      marginTop: 2,
  },
  messageTime: {
      fontSize: 11,
      color: 'grey',
      marginRight: 5,
  },
  ticks: {
      fontSize: 11,
  },
  typingIndicator: {
      paddingLeft: 10,
      paddingBottom: 5,
      fontSize: 12,
      color: 'grey'
  },
  deleteButton: {
      padding: 8,
      marginHorizontal: 5,
  },
  deleteButtonText: {
      fontSize: 18,
  }
});

export default ChatScreen;

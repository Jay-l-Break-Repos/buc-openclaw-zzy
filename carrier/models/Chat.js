import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  user: {
    type: String,
    required: [true, 'user is required'],
    trim: true,
  },
  text: {
    type: String,
    required: [true, 'text is required'],
    trim: true,
  },
  channel: {
    type: String,
    required: [true, 'channel is required'],
    trim: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;

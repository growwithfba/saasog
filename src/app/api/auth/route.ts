import { NextRequest, NextResponse } from 'next/server';

// In-memory user storage for beta
let users = [
  {
    email: 'demo@example.com',
    password: 'password123',
    name: 'Demo User'
  },
  {
    email: 'test@test.com',
    password: 'test',
    name: 'Test User'
  }
];

// In-memory token storage
let validTokens = new Map();

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { email, password, action } = data;
    
    // Register new user
    if (action === 'register') {
      const { name } = data;
      
      // Simple validation
      if (!email || !password || !name) {
        return NextResponse.json({ 
          success: false,
          error: 'All fields are required' 
        }, { status: 400 });
      }
      
      // Check if user already exists
      const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existingUser) {
        return NextResponse.json({ 
          success: false,
          error: 'Email already registered' 
        }, { status: 400 });
      }
      
      // Add new user
      const newUser = { email, password, name };
      users.push(newUser);
      
      // Create a simple token
      const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
      
      // Store token with 7 day expiry
      validTokens.set(token, {
        email: newUser.email,
        name: newUser.name,
        expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
      });
      
      return NextResponse.json({ 
        success: true,
        user: {
          email: newUser.email,
          name: newUser.name
        },
        token
      });
    }
    
    // Login existing user
    else {
      // Simple validation
      if (!email || !password) {
        return NextResponse.json({ 
          success: false,
          error: 'Email and password are required' 
        }, { status: 400 });
      }
      
      // Find user
      const user = users.find(u => 
        u.email.toLowerCase() === email.toLowerCase() && 
        u.password === password
      );
      
      if (!user) {
        return NextResponse.json({ 
          success: false,
          error: 'Invalid credentials' 
        }, { status: 401 });
      }
      
      // Create a simple token
      const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
      
      // Store token with 7 day expiry
      validTokens.set(token, {
        email: user.email,
        name: user.name,
        expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
      });
      
      return NextResponse.json({ 
        success: true,
        user: {
          email: user.email,
          name: user.name
        },
        token
      });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Authentication failed' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader) {
      return NextResponse.json({
        success: false,
        error: 'No token provided'
      }, { status: 401 });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Check if token exists and is valid
    const tokenData = validTokens.get(token);
    
    if (!tokenData) {
      return NextResponse.json({
        success: false,
        error: 'Invalid token'
      }, { status: 401 });
    }
    
    // Check if token has expired
    if (tokenData.expires < Date.now()) {
      validTokens.delete(token);
      return NextResponse.json({
        success: false,
        error: 'Token expired'
      }, { status: 401 });
    }
    
    // Return user data
    return NextResponse.json({
      success: true,
      user: {
        email: tokenData.email,
        name: tokenData.name
      }
    });
  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Token validation failed'
    }, { status: 500 });
  }
} 
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// In-memory storage for beta - but we'll back it up to cookies
let submissions: any[] = [];

// Use cookies for persistent storage that works on both client and server
export const loadSubmissions = () => {
  try {
    // Server-side: Use Next.js cookies API
    const cookieStore = cookies();
    const savedSubmissions = cookieStore.get('savedSubmissions');
    
    if (savedSubmissions) {
      try {
        // Try to parse the cookie data
        const cookieData = JSON.parse(decodeURIComponent(savedSubmissions.value));
        
        // If the cookie has data and our in-memory cache is empty, use the cookie data
        if (cookieData && Array.isArray(cookieData) && cookieData.length > 0 && submissions.length === 0) {
          submissions = cookieData;
          console.log(`Loaded ${submissions.length} submissions from cookies`);
        }
      } catch (e) {
        console.error('Error parsing submissions from cookies:', e);
      }
    }
    
    // Return whatever we have (from memory or cookies)
    return submissions;
  } catch (error) {
    console.error('Error loading saved submissions:', error);
    return submissions; // Return whatever we have in memory
  }
};

// Store submissions in a cookie with a global scope
export const saveSubmissions = (response: NextResponse, data: any[]) => {
  try {
    if (data && data.length > 0) {
      // Store in memory for this server instance
      submissions = data;
      
      // For the cookie, store only essential data (IDs and minimal metadata)
      const minimalSubmissions = data.map(sub => ({
        id: sub.id,
        title: sub.title,
        userId: sub.userId,
        createdAt: sub.createdAt,
        score: sub.score,
        status: sub.status
      }));
      
      // Only save up to 20 submissions in the cookie to avoid size limits
      const limitedSubmissions = minimalSubmissions.slice(0, 20);
      
      // Store minimal version in cookie
      response.cookies.set({
        name: 'savedSubmissions',
        value: encodeURIComponent(JSON.stringify(limitedSubmissions)),
        path: '/', // Available throughout the site
        maxAge: 60 * 60 * 24 * 7, // 1 week
        httpOnly: false, // Accessible from JavaScript
        sameSite: 'strict'
      });
      
      // Also save IDs separately for easier lookup
      const submissionIds = data.map(sub => sub.id);
      response.cookies.set({
        name: 'submissionIds',
        value: JSON.stringify(submissionIds.slice(0, 100)), // Limit to 100 IDs
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 1 week
        httpOnly: false,
        sameSite: 'strict'
      });
      
      console.log(`Saved ${limitedSubmissions.length} submissions to cookie storage`);
    }
  } catch (error) {
    console.error('Error saving submissions:', error);
  }
  
  return response;
};

// Global in-memory map to store full submission details by ID
const submissionDetails = new Map<string, any>();

// Function to get submissions - make sure we always get the latest data
export const getSubmissions = () => {
  // Always try to load from storage first
  return loadSubmissions();
};

// Get a specific submission by ID
export const getSubmissionById = (id: string) => {
  // First check our detailed map
  if (submissionDetails.has(id)) {
    console.log(`Retrieved submission ${id} from detailed cache`);
    return submissionDetails.get(id);
  }
  
  // If not found, load all submissions and find by ID
  const allSubmissions = loadSubmissions();
  const submission = allSubmissions.find(sub => sub.id === id);
  
  if (submission) {
    console.log(`Found submission ${id} in general submissions list`);
    
    // If found, add to detail map for next time
    submissionDetails.set(id, submission);
  } else {
    console.log(`Submission ${id} not found in any storage`);
  }
  
  return submission;
}; 
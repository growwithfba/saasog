// Client-side storage utilities

/**
 * Saves a submission to browser storage for persistence between refreshes
 */
export const saveSubmissionToLocalStorage = (submission: any) => {
  try {
    if (!submission || !submission.id) {
      console.error('Cannot save submission: missing ID');
      return;
    }

    // Get current submission details
    const storedSubmissions = localStorage.getItem('clientSubmissions');
    let submissions = [];

    if (storedSubmissions) {
      try {
        submissions = JSON.parse(storedSubmissions);
      } catch (e) {
        console.error('Error parsing stored submissions:', e);
        // Start with a new array if parsing fails
        submissions = [];
      }
    }

    // Check if this submission already exists
    const existingIndex = submissions.findIndex((sub: any) => sub.id === submission.id);
    
    if (existingIndex > -1) {
      // Update existing
      submissions[existingIndex] = submission;
      console.log(`Updated existing submission in localStorage: ${submission.id}`);
    } else {
      // Add new
      submissions.push(submission);
      console.log(`Added new submission to localStorage: ${submission.id}`);
    }

    // Save back to localStorage
    localStorage.setItem('clientSubmissions', JSON.stringify(submissions));
    
    // Also save a map of IDs to find them quickly
    const submissionMap = JSON.parse(localStorage.getItem('submissionIdMap') || '{}');
    submissionMap[submission.id] = true;
    localStorage.setItem('submissionIdMap', JSON.stringify(submissionMap));
    
    // Also save some key data separately in case the full object is too large
    // This helps ensure we can at least show basic information in the dashboard
    try {
      const submissionBasics = submissions.map((sub: any) => ({
        id: sub.id,
        title: sub.title || 'Untitled Analysis',
        userId: sub.userId,
        createdAt: sub.createdAt || new Date().toISOString(),
        score: typeof sub.score === 'number' ? sub.score : 0,
        status: sub.status || 'N/A'
      }));
      
      localStorage.setItem('submissionBasics', JSON.stringify(submissionBasics));
      
      // Also save individual submission by ID for direct access
      // This is helpful when the main list might be too large
      localStorage.setItem(`submission_${submission.id}`, JSON.stringify(submission));
      
    } catch (storageError) {
      console.error(`Storage error for submission basics: ${storageError}`);
    }
    
    console.log(`Saved submission ${submission.id} to client storage`);
  } catch (error) {
    console.error('Error saving submission to localStorage:', error);
    
    // Try to save just the ID if full storage fails
    try {
      if (submission && submission.id) {
        const idMap = JSON.parse(localStorage.getItem('submissionIdMap') || '{}');
        idMap[submission.id] = true;
        localStorage.setItem('submissionIdMap', JSON.stringify(idMap));
      }
    } catch (fallbackError) {
      console.error('Even fallback storage failed:', fallbackError);
    }
  }
};

/**
 * Gets a submission by ID from browser storage
 */
export const getSubmissionFromLocalStorage = (id: string) => {
  try {
    if (!id) return null;
    
    // First, try to get the individual submission by ID
    // This is the most direct approach and should work even if the main list is too large
    const directSubmission = localStorage.getItem(`submission_${id}`);
    if (directSubmission) {
      try {
        const parsed = JSON.parse(directSubmission);
        console.log(`Retrieved submission ${id} directly from localStorage`);
        return parsed;
      } catch (parseError) {
        console.error(`Error parsing direct submission ${id}:`, parseError);
      }
    }
    
    // If direct access fails, check if we have this ID in our map
    const submissionMap = JSON.parse(localStorage.getItem('submissionIdMap') || '{}');
    if (!submissionMap[id]) {
      console.log(`Submission ID ${id} not found in ID map`);
      return null;
    }
    
    // Get all submissions
    const storedSubmissions = localStorage.getItem('clientSubmissions');
    if (!storedSubmissions) {
      console.log('No client submissions found in localStorage');
      return null;
    }
    
    try {
      const submissions = JSON.parse(storedSubmissions);
      
      // Find the specific submission
      const submission = submissions.find((sub: any) => sub.id === id);
      
      if (submission) {
        console.log(`Found submission ${id} in main submissions list`);
        
        // Also save it individually for direct access next time
        localStorage.setItem(`submission_${id}`, JSON.stringify(submission));
      } else {
        console.log(`Submission ${id} not found in submissions list despite being in ID map`);
      }
      
      return submission;
    } catch (parseError) {
      console.error(`Error parsing client submissions: ${parseError}`);
      return null;
    }
  } catch (error) {
    console.error('Error retrieving submission from localStorage:', error);
    return null;
  }
};

/**
 * Gets all submissions for a user from browser storage
 */
export const getUserSubmissionsFromLocalStorage = (userId: string) => {
  try {
    if (!userId) return [];
    
    // Try to get the submission basics first which is smaller and more likely to load
    const submissionBasics = localStorage.getItem('submissionBasics');
    if (submissionBasics) {
      try {
        const basics = JSON.parse(submissionBasics);
        const userBasics = basics.filter((sub: any) => sub.userId === userId);
        
        if (userBasics.length > 0) {
          console.log(`Found ${userBasics.length} basic submissions for user ${userId}`);
          
          // Try to load full details for each submission
          const detailedSubmissions = userBasics.map((basic: any) => {
            const detailItem = localStorage.getItem(`submission_${basic.id}`);
            if (detailItem) {
              try {
                return JSON.parse(detailItem);
              } catch (e) {
                // If parsing fails, return the basic info
                return basic;
              }
            }
            return basic;
          });
          
          return detailedSubmissions;
        }
      } catch (e) {
        console.error('Error parsing submission basics:', e);
      }
    }
    
    // If basics approach fails, try the old way with full submissions list
    const storedSubmissions = localStorage.getItem('clientSubmissions');
    if (!storedSubmissions) return [];
    
    try {
      const submissions = JSON.parse(storedSubmissions);
      
      // Filter by user ID
      const userSubmissions = submissions.filter((sub: any) => sub.userId === userId);
      console.log(`Found ${userSubmissions.length} submissions for user ${userId} in main list`);
      return userSubmissions;
    } catch (parseError) {
      console.error(`Error parsing clientSubmissions: ${parseError}`);
      return [];
    }
  } catch (error) {
    console.error('Error retrieving user submissions from localStorage:', error);
    return [];
  }
}; 
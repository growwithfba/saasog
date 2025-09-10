# Amazon FBA Product Analysis Tool - Codebase Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Core Features](#core-features)
6. [Data Flow](#data-flow)
7. [Key Components](#key-components)
8. [Database Schema](#database-schema)
9. [API Endpoints](#api-endpoints)
10. [Environment Setup](#environment-setup)
11. [Development Guidelines](#development-guidelines)
12. [Troubleshooting](#troubleshooting)

## Project Overview

This is a Next.js-based web application designed for Amazon FBA (Fulfillment by Amazon) specialists to analyze product market viability. The tool processes competitor data from CSV exports (primarily Helium 10 and Hero Launchpad) and provides comprehensive market analysis with scoring.

### Business Context
- **FBA (Fulfillment by Amazon)**: Service where Amazon handles storage, shipping, and customer service for sellers
- **Market Analysis**: Determines if a product category is profitable and not oversaturated
- **Competitor Research**: Analyzes existing products in the market to assess opportunity
- **Data Sources**: Helium 10, Hero Launchpad, and other Amazon research tools

### Key Metrics Analyzed
- Monthly Revenue & Sales Volume
- Best Seller Rank (BSR) and trends
- Price stability and trends
- Review counts and ratings
- Market share distribution
- Fulfillment methods
- Product age and market maturity

## Architecture

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API   │    │   External      │
│   (React/Next)  │◄──►│   Routes        │◄──►│   Services      │
│                 │    │                 │    │   (Keepa API)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       
         ▼                       ▼                       
┌─────────────────┐    ┌─────────────────┐              
│   Redux Store   │    │   Supabase      │              
│   (State Mgmt)  │    │   (Database)    │              
└─────────────────┘    └─────────────────┘              
```

### Frontend Architecture
- **Next.js 14**: App Router with React Server Components
- **TypeScript**: Full type safety throughout the application
- **Redux Toolkit**: Global state management for auth and Keepa data
- **Tailwind CSS**: Utility-first styling with custom dark theme

### Backend Architecture
- **Next.js API Routes**: RESTful endpoints for data processing
- **Supabase**: PostgreSQL database with real-time subscriptions
- **Authentication**: Supabase Auth with anonymous session support

## Technology Stack

### Core Technologies
- **Next.js 14.1.0**: React framework with App Router
- **React 18.2.0**: UI library
- **TypeScript 5.3.3**: Type safety
- **Tailwind CSS 3.4.17**: Styling framework

### State Management & Data
- **Redux Toolkit 2.5.1**: Global state management
- **Supabase 2.49.4**: Database and authentication
- **PapaParse 5.5.2**: CSV parsing
- **React Table 8.20.6**: Data tables

### Visualization & UI
- **D3.js 7.9.0**: Data visualization
- **Recharts 2.15.1**: React charts
- **Framer Motion 12.6.3**: Animations
- **Lucide React 0.474.0**: Icons

### Development Tools
- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **Autoprefixer**: CSS vendor prefixes

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── analyze/       # Analysis endpoint
│   ├── dashboard/         # Dashboard page
│   ├── login/            # Authentication pages
│   ├── register/
│   ├── reset/
│   ├── submission/       # Individual analysis view
│   └── analyze/          # Analysis page
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── dashboard/        # Dashboard components
│   ├── Upload/           # CSV upload components
│   ├── Results/          # Analysis results display
│   ├── Charts/           # Data visualization
│   └── Keepa/            # Keepa integration
├── services/             # External service integrations
│   └── keepaService.ts   # Keepa API client
├── store/                # Redux store configuration
│   ├── authSlice.ts      # Authentication state
│   ├── keepaSlice.ts     # Keepa data state
│   └── index.ts          # Store setup
├── utils/                # Utility functions
│   ├── scoring.ts        # Market scoring algorithms
│   ├── formatters.ts     # Data formatting
│   └── supabaseClient.ts # Database client
└── context/              # React contexts
    └── UserContext.tsx   # User context provider
```

## Core Features

### 1. CSV Upload and Processing
**Location**: `src/components/Upload/CsvUpload.tsx`

- **Multi-file Upload**: Supports uploading multiple CSV files simultaneously
- **Format Detection**: Automatically detects Helium 10 vs Hero Launchpad formats
- **Data Deduplication**: Removes duplicate ASINs across files
- **Column Normalization**: Maps various column names to standard format
- **Real-time Progress**: Shows upload and processing progress

**Supported CSV Formats**:
- Helium 10 exports
- Hero Launchpad exports
- Custom formats with standard Amazon product data

### 2. Market Scoring Algorithm
**Location**: `src/utils/scoring.ts`

The scoring system uses a sophisticated algorithm that evaluates:

**Core Metrics (60% weight)**:
- Monthly Revenue (25%)
- Monthly Sales (15%)
- Market Share (15%)
- Reviews (15%)
- BSR (10%)

**Stability Metrics (40% weight)**:
- BSR Consistency (20%)
- Revenue per Competitor (15%)
- Price Consistency (12%)
- Other factors (13%)

**Scoring Ranges**:
- **PASS** (70-100%): Excellent market opportunity
- **RISKY** (40-69%): Moderate opportunity, proceed with caution
- **FAIL** (0-39%): Poor market, avoid

### 3. Keepa API Integration
**Location**: `src/services/keepaService.ts`

- **Historical Data**: Fetches 6-month price and BSR history
- **Trend Analysis**: Calculates price and BSR trends
- **Stability Metrics**: Measures data volatility
- **Token Management**: Tracks API usage and limits

### 4. Data Visualization
**Location**: `src/components/Charts/` and `src/components/Results/`

- **Market Distribution Charts**: Pie charts for fulfillment, age, quality
- **Competitor Analysis Tables**: Sortable tables with strength indicators
- **Trend Visualizations**: Line charts for historical data
- **Performance Metrics**: Score breakdowns and recommendations

### 5. Authentication System
**Location**: `src/components/auth/`

- **Supabase Integration**: Email/password authentication
- **Anonymous Sessions**: Allows usage without registration
- **Session Management**: Persistent login state
- **User Profiles**: Basic user information storage

### 6. Data Persistence
**Locations**: `src/app/api/analyze/route.ts`, database utilities

- **Supabase Database**: Primary storage for authenticated users
- **Local Storage**: Backup storage for anonymous users
- **Cookie Fallback**: Additional persistence layer
- **Analysis History**: Complete analysis preservation

## Data Flow

### 1. CSV Upload Flow
```
User Upload → CSV Parse → Column Normalization → Data Validation → 
Competitor Processing → ASIN Extraction → Keepa Analysis → 
Market Scoring → Results Display → Data Persistence
```

### 2. Market Analysis Flow
```
Competitor Data → Individual Scoring → Market-Level Modifiers → 
Auto-Fail Checks → Final Score Calculation → Status Determination
```

### 3. Keepa Integration Flow
```
ASIN Extraction → Top 5 Selection → Keepa API Call → 
Data Processing → Trend Analysis → Stability Calculation → 
Score Integration
```

## Key Components

### 1. CsvUpload Component
**File**: `src/components/Upload/CsvUpload.tsx`

**Purpose**: Handles CSV file upload, parsing, and initial processing

**Key Features**:
- Drag-and-drop interface
- Multi-file support with progress tracking
- Format detection and validation
- Real-time processing feedback
- Error handling and user guidance

**Props**:
- `onSubmit`: Callback when analysis completes
- `userId`: User identifier for data persistence

### 2. Dashboard Component
**File**: `src/components/dashboard/Dashboard.tsx`

**Purpose**: Main application interface showing saved analyses

**Key Features**:
- Tabbed interface (Saved Products / New Analysis)
- Sortable analysis table
- Bulk operations (delete, select all)
- Pagination with configurable page sizes
- Real-time data refresh

### 3. ProductVettingResults Component
**File**: `src/components/Results/ProductVettingResults.tsx`

**Purpose**: Displays comprehensive analysis results

**Key Features**:
- Market score display with status indicators
- Competitor strength analysis
- Market distribution visualizations
- Keepa historical data integration
- Detailed metrics breakdown

### 4. Keepa Service
**File**: `src/services/keepaService.ts`

**Purpose**: Integrates with Keepa API for Amazon historical data

**Key Methods**:
- `getCompetitorData(asins)`: Fetch historical data for ASINs
- `transformKeepaData(products)`: Process raw API responses
- `analyzeBSRTrend(history)`: Calculate BSR trends
- `analyzePriceTrend(history)`: Calculate price trends

### 5. Scoring Utilities
**File**: `src/utils/scoring.ts`

**Purpose**: Market analysis and scoring algorithms

**Key Functions**:
- `calculateScore(competitor, keepaData)`: Individual competitor scoring
- `calculateMarketScore(competitors, keepaResults)`: Overall market scoring
- `getCompetitorStrength(score)`: Strength categorization
- `getCompetitionLevel(competitors)`: Market competition assessment

## Database Schema

### Submissions Table
```sql
CREATE TABLE submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  product_name text,
  score numeric,
  status text CHECK (status IN ('PASS', 'RISKY', 'FAIL')),
  submission_data jsonb,
  metrics jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

### Key Fields:
- **id**: Unique identifier
- **user_id**: Links to Supabase auth user
- **title**: Analysis title/product name
- **score**: Calculated market score (0-100)
- **status**: Market assessment (PASS/RISKY/FAIL)
- **submission_data**: Complete analysis data (JSON)
- **metrics**: Calculated metrics (JSON)

## API Endpoints

### POST /api/analyze
**Purpose**: Save analysis results and handle CSV processing

**Request Body**:
```json
{
  "userId": "string",
  "title": "string",
  "score": number,
  "status": "PASS|RISKY|FAIL",
  "productData": object,
  "keepaResults": array,
  "marketScore": object,
  "productName": "string"
}
```

**Response**:
```json
{
  "success": boolean,
  "submissionId": "string",
  "message": "string"
}
```

### GET /api/analyze?userId={userId}
**Purpose**: Retrieve saved analyses for a user

**Response**:
```json
{
  "success": boolean,
  "submissions": array,
  "source": "string"
}
```

## Environment Setup

### Required Environment Variables
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Keepa API Configuration
KEEPA_API_KEY=your_keepa_api_key

# Optional: Debug flags
DEBUG_MODE=false
```

### Installation
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Supabase project and configure environment variables
4. Obtain Keepa API key and add to environment
5. Run development server: `npm run dev`

## Development Guidelines

### Code Style
- **TypeScript**: Use strict typing throughout
- **Component Structure**: Functional components with hooks
- **State Management**: Redux for global state, local state for UI
- **Error Handling**: Comprehensive error boundaries and user feedback
- **Performance**: Optimize for large CSV files and data processing

### File Naming Conventions
- **Components**: PascalCase (`CsvUpload.tsx`)
- **Utilities**: camelCase (`scoringUtils.ts`)
- **Types**: PascalCase interfaces (`KeepaAnalysisResult`)
- **Constants**: UPPER_SNAKE_CASE

### Component Guidelines
- Use TypeScript interfaces for all props
- Implement proper error boundaries
- Add loading states for async operations
- Include comprehensive JSDoc comments
- Follow React hooks rules of use

### State Management
- **Redux**: Use for authentication and Keepa data
- **Local State**: Use for component-specific UI state
- **Context**: Use sparingly, mainly for user data
- **Server State**: Consider React Query for future API calls

### Testing Considerations
- Unit tests for utility functions (scoring algorithms)
- Integration tests for CSV processing
- End-to-end tests for critical user flows
- Mock external API calls (Keepa)

## Troubleshooting

### Common Issues

#### 1. CSV Processing Failures
**Symptoms**: "Missing required fields" errors
**Solutions**:
- Check CSV column names match expected formats
- Verify ASIN format (10 alphanumeric characters)
- Ensure numeric fields contain valid numbers
- Check for proper CSV encoding (UTF-8)

#### 2. Keepa API Issues
**Symptoms**: "Keepa analysis failed" messages
**Solutions**:
- Verify API key is valid and has sufficient tokens
- Check ASIN format extraction from CSV
- Monitor API rate limits
- Ensure internet connectivity for API calls

#### 3. Authentication Problems
**Symptoms**: Login failures or session issues
**Solutions**:
- Verify Supabase configuration
- Check environment variables
- Clear browser cookies and localStorage
- Verify Supabase project settings

#### 4. Database Connection Issues
**Symptoms**: Data not saving or loading
**Solutions**:
- Check Supabase connection status
- Verify database permissions
- Review API endpoint responses
- Check for anonymous session creation

### Debug Tools
- Browser DevTools for client-side debugging
- Supabase dashboard for database inspection
- Network tab for API call monitoring
- Redux DevTools for state inspection

### Performance Optimization
- Use React.memo for expensive components
- Implement virtualization for large competitor lists
- Optimize CSV parsing with web workers
- Cache Keepa API responses when possible

### Security Considerations
- Validate all CSV input data
- Sanitize user inputs
- Use Supabase RLS (Row Level Security)
- Protect API keys in environment variables
- Implement proper authentication flows

---

## Recent Updates and Known Issues

### Current Version Features
- Multi-CSV file upload with deduplication
- Enhanced market scoring algorithm (v5)
- Improved Keepa integration with better error handling
- Advanced competitor analysis with strength ratings
- Real-time processing feedback

### Known Issues
1. Large CSV files (>1000 rows) may cause performance issues
2. Keepa API rate limiting can affect batch processing
3. Some CSV formats may require manual column mapping
4. Anonymous session data may not persist across browser sessions

### Planned Improvements
1. Add email confirmation for user registration
2. Implement "superhero selling points" AI feature
3. Direct Helium 10 API integration
4. Enhanced UI/branding improvements
5. Automated competitor search using ASIN only

---

This documentation should be kept up-to-date as the application evolves. For specific implementation details, refer to the actual source code and inline comments. 
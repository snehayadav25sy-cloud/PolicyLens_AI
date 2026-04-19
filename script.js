import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ==========================================
// 1. FIREBASE SETUP
// ==========================================
// TODO: Replace this object with your actual Firebase Project keys.
// Go to console.firebase.google.com -> Project Settings -> General -> Web App
const firebaseConfig = {
  apiKey: "AIzaSyD0zL3xeAbNmkt75Xjy4UtWlK-7xBBBrtA",
  authDomain: "policylens-ai-697cb.firebaseapp.com",
  projectId: "policylens-ai-697cb",
  storageBucket: "policylens-ai-697cb.firebasestorage.app",
  messagingSenderId: "973035707647",
  appId: "1:973035707647:web:0845e34217979350c840ca",
  measurementId: "G-B2J80CKS7F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 2. AI SETUP (No VectorDB needed for simple rules!)
// ==========================================
// TODO: Get a FREE API key from https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = "AIzaSyDBg3SWqUiZSl33Qwu21a-JlMYyx18BrHA";

// In a full production app, you would fetch these from Firebase Firestore too.
// For this script, we have them here to show the AI how to check them.
const policyDatabase = {
    "Scholarship Scheme": "To be eligible, the applicant must be under 26 years of age. Their annual income must be exactly or less than ₹4,00,000. EXCEPTION: If the category is SC/ST, the income limit is relaxed to ₹6,00,000.",
    "Loan Eligibility": "For a standard loan, the applicant must have an income over ₹3,00,000 and should be at least 21 years old. Category does not matter.",
    "Insurance Policy": "Standard insurance is applicable to any category if the applicant is between 18 and 60 years old."
};

// ==========================================
// 3. THE CORE LOGIC
// ==========================================
document.getElementById('details-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Grab exactly what the user typed in
    const age = document.getElementById('age').value;
    const income = document.getElementById('income').value;
    const category = document.getElementById('category').value;
    const policyName = document.getElementById('policy-select').value;
    
    // Show a loading message in the UI
    document.getElementById('ai-explanation').innerText = `Analyzing Policy: ${policyName}... Please wait.`;
    document.getElementById('ai-verdict').style.display = 'none';
    document.getElementById('ai-reference').style.display = 'none';
    
    // Reset the decision flow to pending
    const flowContainer = document.getElementById('decision-flow');
    flowContainer.innerHTML = `
        <div class="step pending">
            <span class="step-icon">○</span>
            <span class="step-text">Checking Age...</span>
        </div>
        <div class="step pending">
            <span class="step-icon">○</span>
            <span class="step-text">Checking Income...</span>
        </div>
        <div class="step pending">
            <span class="step-icon">○</span>
            <span class="step-text">Checking Category...</span>
        </div>
    `;

    // --- STEP A: LOG TO FIREBASE ---
    try {
        await addDoc(collection(db, "eligibility_checks"), {
            age: parseInt(age),
            income: parseInt(income),
            category: category,
            policyChecked: policyName,
            status: "Pending AI Check",
            timestamp: new Date()
        });
        console.log("Successfully securely logged to Firebase Firestore!");
    } catch (e) {
        console.error("Firebase Error: Make sure your Firebase Config is correct. Error was: ", e.message);
    }

    // --- STEP B: CHECK ELIGIBILITY WITH AI ---
    const policyText = policyDatabase[policyName];
    
    // We create a strict prompt for the AI so it acts exactly like a rigid Vector Database policy checker
    const prompt = `You are a strict policy evaluator AI. 
Read this policy rule: "${policyText}"
The user's details are: Age=${age}, Income=₹${income}, Category=${category}.
Determine if they are eligible based ONLY on the text provided. 
Respond in EXACTLY a JSON format like this, do not use markdown blocks, just raw JSON:
{ 
  "eligible": true, 
  "explanation": "A short 2 sentence reason why.", 
  "reference": "Quote the relevant rule here",
  "checks": [
    { "name": "Age Check", "passed": true },
    { "name": "Income Check", "passed": false },
    { "name": "Category Rule", "passed": true }
  ]
}`;

    try {
        if(GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
            throw new Error("Missing AI Key! Please paste your Gemini API Key at the top of script.js.");
        }

        // Call the Google Gemini AI
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        // Check if the API returned an error (like an invalid key or model issue)
        if (data.error) {
            throw new Error(`Google API Error: ${data.error.message}`);
        }

        // Check if candidates exist
        if (!data.candidates || data.candidates.length === 0) {
            console.error("Full API Response:", data);
            throw new Error("The AI returned an empty response. Please try again.");
        }
        
        // Extract the response
        let textResult = data.candidates[0].content.parts[0].text;
        
        // Sometimes AI adds ```json markers, we clean them so we can parse it
        if (textResult.includes('```json')) {
            textResult = textResult.replace(/```json/g, '').replace(/```/g, '');
        }
        
        let aiResponse;
        try {
            aiResponse = JSON.parse(textResult);
        } catch (parseError) {
            console.error("Raw AI Output:", textResult);
            throw new Error("The AI did not return proper JSON. Please try clicking submit again.");
        }

        // --- STEP C: UPDATE THE UI ---
        document.getElementById('ai-explanation').innerText = aiResponse.explanation;
        
        const verdictElement = document.getElementById('ai-verdict');
        document.getElementById('verdict-text').innerText = aiResponse.eligible ? 'Eligible' : 'Not Eligible';
        
        verdictElement.style.display = 'block';
        // Basic styling toggle for the UI depending on the result
        if(aiResponse.eligible) {
            verdictElement.style.borderLeft = "4px solid #4CAF50"; // Green
            verdictElement.style.color = "#4CAF50";
        } else {
            verdictElement.style.borderLeft = "4px solid #F44336"; // Red
            verdictElement.style.color = "#F44336";
        }
        
        document.getElementById('ai-reference').style.display = 'block';
        document.getElementById('reference-text').innerText = aiResponse.reference;

        // --- STEP D: UPDATE DYNAMIC UI STEPS ---
        const flowContainer = document.getElementById('decision-flow');
        flowContainer.innerHTML = ''; // Clear pending state
        
        if (aiResponse.checks && Array.isArray(aiResponse.checks)) {
            aiResponse.checks.forEach(check => {
                const stepDiv = document.createElement('div');
                stepDiv.className = `step ${check.passed ? 'passed' : 'failed'}`;
                stepDiv.innerHTML = `
                    <span class="step-icon">${check.passed ? '✓' : '✗'}</span>
                    <span class="step-text">${check.name}</span>
                `;
                flowContainer.appendChild(stepDiv);
            });
        }

    } catch (err) {
        console.error("Caught Error:", err);
        document.getElementById('ai-explanation').innerText = `System Error: ${err.message}`;
    }
});

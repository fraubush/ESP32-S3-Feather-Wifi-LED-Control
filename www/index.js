const brightnessSlider = document.getElementById('brightness');
const brightnessValue = document.getElementById('brightness-value');
const sunFollower = document.getElementById('sun-follower');

// Constants for API and location
const LOCATION = {
    lat: 39.97411239400361,
    lng: -75.126615028835,
    timezone: 'America/New_York'
};

// Cache key for storing API data
const CACHE_KEY = 'sunDataCache';

// Constants for sun follower persistence
const SUN_FOLLOWER_KEY = 'sunFollowerEnabled';

async function fetchSunData() {
    try {
        // Check if we have cached data for today
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { date, data } = JSON.parse(cached);
            if (date === new Date().toDateString()) {
                console.log(`[${new Date().toLocaleTimeString()}] Using cached sun data`);
                return data;
            }
        }

        // Fetch new data if cache is missing or outdated
        console.log(`[${new Date().toLocaleTimeString()}] Fetching new sun data...`);
        const url = new URL('https://api.sunrise-sunset.org/json');
        url.search = new URLSearchParams({
            lat: LOCATION.lat,
            lng: LOCATION.lng,
            formatted: 0,
            tzid: LOCATION.timezone
        });

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 'OK') {
            throw new Error('Invalid API response');
        }

        // Cache the response
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            date: new Date().toDateString(),
            data: data
        }));

        console.log(`[${new Date().toLocaleTimeString()}] Successfully fetched sun data:`, {
            sunrise: new Date(data.results.sunrise).toLocaleTimeString(),
            sunset: new Date(data.results.sunset).toLocaleTimeString(),
            civilTwilightBegin: new Date(data.results.civil_twilight_begin).toLocaleTimeString(),
            civilTwilightEnd: new Date(data.results.civil_twilight_end).toLocaleTimeString()
        });

        return data;
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Error fetching sun data:`, error);
        // Retry once after 5 seconds
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const data = await fetchSunData();
                    resolve(data);
                } catch (retryError) {
                    reject(retryError);
                }
            }, 5000);
        });
    }
}

async function setColor(color) {
    try {
        const response = await fetch(`/color/${color}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(`Color set to ${color}`);
    } catch (error) {
        console.error('Error setting color:', error);
    }
}

async function setPattern(pattern) {
    try {
        const response = await fetch(`/pattern/${pattern}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(`Pattern ${pattern} started`);
    } catch (error) {
        console.error('Error setting pattern:', error);
    }
}

async function setBrightness(value) {
    try {
        const brightness = value / 100; // Convert 0-100 to 0-1
        brightnessValue.textContent = `${value}%`; // Update the display
        const response = await fetch(`/brightness/${brightness}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(`Brightness set to ${brightness}`);
    } catch (error) {
        console.error('Error setting brightness:', error);
    }
}

// Initialize sun follower state from localStorage
function initializeSunFollower() {
    const enabled = localStorage.getItem(SUN_FOLLOWER_KEY) === 'true';
    sunFollower.checked = enabled;
    console.log(`[${new Date().toLocaleTimeString()}] Sun follower initialized: ${enabled}`);
    if (enabled) {
        startSunFollower();
    }
}

async function setSunFollower(enabled) {
    try {
        // Only proceed if the state is actually changing
        if (localStorage.getItem(SUN_FOLLOWER_KEY) === enabled.toString()) {
            return; // Exit if state hasn't changed
        }

        localStorage.setItem(SUN_FOLLOWER_KEY, enabled);
        console.log(`[${new Date().toLocaleTimeString()}] Sun follower ${enabled ? 'enabled' : 'disabled'}`);
        
        if (enabled) {
            await startSunFollower();
        } else {
            // Return to manual brightness when disabled
            await setBrightness(brightnessSlider.value);
        }
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Error setting sun follower:`, error);
    }
}

// Calculate brightness based on current time and twilight period
function calculateBrightness(now, twilightStart, twilightEnd) {
    const totalTransitionTime = twilightEnd - twilightStart;
    const currentTransitionTime = now - twilightStart;
    const transitionPercentage = Math.max(0, Math.min(1, currentTransitionTime / totalTransitionTime));
    return transitionPercentage;
}

async function updateBrightnessForTime(sunData) {
    const now = new Date();
    const sunrise = new Date(sunData.results.sunrise);
    const sunset = new Date(sunData.results.sunset);
    const twilightBegin = new Date(sunData.results.civil_twilight_begin);
    const twilightEnd = new Date(sunData.results.civil_twilight_end);
    
    let targetBrightness = 0;
    const maxBrightness = brightnessSlider.value / 100;

    // Morning transition (fade out)
    if (now >= twilightBegin && now <= sunrise) {
        const brightness = 1 - calculateBrightness(now, twilightBegin, sunrise);
        targetBrightness = brightness * maxBrightness;
        console.log(`[${now.toLocaleTimeString()}] Morning transition - setting brightness to ${Math.round(targetBrightness * 100)}%`);
    }
    // Evening transition (fade in)
    else if (now >= sunset && now <= twilightEnd) {
        const brightness = calculateBrightness(now, sunset, twilightEnd);
        targetBrightness = brightness * maxBrightness;
        console.log(`[${now.toLocaleTimeString()}] Evening transition - setting brightness to ${Math.round(targetBrightness * 100)}%`);
    }
    // Nighttime
    else if (now > twilightEnd || now < twilightBegin) {
        targetBrightness = maxBrightness;
        console.log(`[${now.toLocaleTimeString()}] Nighttime - setting brightness to ${Math.round(targetBrightness * 100)}%`);
    }
    // Daytime
    else {
        targetBrightness = 0;
        console.log(`[${now.toLocaleTimeString()}] Daytime - setting brightness to 0%`);
    }

    await setBrightness(Math.round(targetBrightness * 100));
}

// Update the startSunFollower function
async function startSunFollower() {
    try {
        const sunData = await fetchSunData();
        console.log(`[${new Date().toLocaleTimeString()}] Sun follower started with data:`, {
            sunrise: new Date(sunData.results.sunrise).toLocaleTimeString(),
            sunset: new Date(sunData.results.sunset).toLocaleTimeString(),
            civilTwilightBegin: new Date(sunData.results.civil_twilight_begin).toLocaleTimeString(),
            civilTwilightEnd: new Date(sunData.results.civil_twilight_end).toLocaleTimeString()
        });

        // Initial brightness update
        await updateBrightnessForTime(sunData);

        // Schedule regular updates
        const updateInterval = setInterval(async () => {
            if (sunFollower.checked) {
                const newSunData = await fetchSunData();
                await updateBrightnessForTime(newSunData);
            } else {
                clearInterval(updateInterval);
            }
        }, 60000); // Check every minute
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Error starting sun follower:`, error);
    }
}

// Update the display when the page loads
brightnessValue.textContent = `${brightnessSlider.value}%`;

brightnessSlider.addEventListener('input', function() {
    setBrightness(brightnessSlider.value);
});

// Add event listener for sun follower checkbox
sunFollower.addEventListener('change', function() {
    setSunFollower(this.checked);
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeSunFollower);
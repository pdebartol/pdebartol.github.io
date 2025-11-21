// Restaurant data will be loaded from JSON files
let selectedPlacesData = [];
let dayToDayData = [];
let honorableMentionsData = [];

const STORAGE_KEY = 'food_rec_custom_restaurants';

// =========================================
// Global State
// =========================================
let selectedPlaces = [];
let dayToDayPlaces = [];
let honorableMentions = [];
let hiddenRestaurants = [];
let mediaIndex = {};
let currentSlideIndex = 0;
let currentRestaurantMedia = [];
let editingRestaurantName = null;
let currentView = 'selected'; // 'selected', 'honorable', or 'everyday'

// =========================================
// Initialization
// =========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadMediaIndex();
    await loadRestaurantData();
    renderRestaurants();
    setupEventListeners();
    setupAdminPanel();
});

// =========================================
// Load Media Index
// =========================================
async function loadMediaIndex() {
    try {
        const response = await fetch('media_index.json');
        if (!response.ok) {
            console.warn('Could not load media_index.json, carousel will not work');
            return;
        }
        mediaIndex = await response.json();
        console.log('Media index loaded:', mediaIndex);
    } catch (err) {
        console.warn('Error loading media index:', err);
    }
}

// =========================================
// Load Restaurant Data
// =========================================
async function loadRestaurantData() {
    try {
        // Try to load from localStorage first
        const savedSelected = localStorage.getItem('food_rec_selected_places');
        const savedDayToDay = localStorage.getItem('food_rec_day_to_day');
        const savedHonorable = localStorage.getItem('food_rec_honorable_mentions');
        const savedHidden = localStorage.getItem('food_rec_hidden_restaurants');

        if (savedSelected && savedDayToDay && savedHonorable) {
            selectedPlaces = JSON.parse(savedSelected);
            dayToDayPlaces = JSON.parse(savedDayToDay);
            honorableMentions = JSON.parse(savedHonorable);
            hiddenRestaurants = savedHidden ? JSON.parse(savedHidden) : [];
            console.log('Loaded from localStorage');
        } else {
            // Load from JSON files
            const [selectedResponse, dayToDayResponse, honorableResponse] = await Promise.all([
                fetch('selected_places.json'),
                fetch('day_to_day.json'),
                fetch('honorable_mentions.json')
            ]);

            if (selectedResponse.ok && dayToDayResponse.ok && honorableResponse.ok) {
                selectedPlaces = await selectedResponse.json();
                dayToDayPlaces = await dayToDayResponse.json();
                honorableMentions = await honorableResponse.json();
                hiddenRestaurants = [];
                // Save to localStorage for future use
                saveRestaurants();
                console.log('Loaded from JSON files');
            } else {
                console.error('Failed to load restaurant data');
            }
        }

        console.log(`Loaded ${selectedPlaces.length} selected places, ${honorableMentions.length} honorable mentions, ${hiddenRestaurants.length} hidden, and ${dayToDayPlaces.length} day-to-day places`);
    } catch (err) {
        console.error('Error loading restaurant data:', err);
    }
}

// =========================================
// Map Functions
// =========================================


// =========================================
// Rendering
// =========================================
function renderRestaurants() {
    const grid = document.getElementById('restaurantGrid');
    const noResults = document.getElementById('noResults');

    grid.innerHTML = '';

    // Select the appropriate data source based on current view
    const restaurants = currentView === 'selected' ? selectedPlaces : honorableMentions;

    // Show grid, hide map for other views
    grid.style.display = 'grid';

    // Use all restaurants without filtering
    let filtered = restaurants;

    if (filtered.length === 0) {
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    filtered.forEach(r => {
        const card = document.createElement('div');
        card.className = 'restaurant-card';

        // Escape single quotes in restaurant name
        const safeName = r.name.replace(/'/g, "\\'");

        card.innerHTML = `
            <a class="card-image-wrapper" onclick="openCarousel('${safeName}'); return false;">
                <div class="card-image" style="background-image: url('${r.photo}')">
                    ${!r.photo || r.photo === '' ? `<div class="placeholder-image"></div>` : ''}
                </div>
                <div class="photo-hover-overlay">
                    <span>📸 View Photos</span>
                </div>
            </a>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="restaurant-name">${r.name}</h2>
                </div>
            <div class="cuisine-tags">
                <span class="tag">${r.cuisine.toUpperCase()}</span>
                <span class="tag price">${r.price}</span>
            </div>
            <p class="description">${r.description}</p>
            <div class="card-footer">
                <a href="${r.map}" target="_blank" class="location-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    ${r.location}
                </a>
            </div>
        </div>
        `;
        grid.appendChild(card);
    });
}

// =========================================
// Carousel Functions
// =========================================
function openCarousel(restaurantName) {
    // Search in all three data sources
    const restaurant = selectedPlaces.find(r => r.name === restaurantName) ||
        honorableMentions.find(r => r.name === restaurantName) ||
        dayToDayPlaces.find(r => r.name === restaurantName);
    if (!restaurant) {
        console.error('Restaurant not found:', restaurantName);
        return;
    }

    // Sanitize restaurant name to match folder name
    const sanitized = restaurant.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    currentRestaurantMedia = mediaIndex[sanitized] || [restaurant.photo];

    // Filter out hidden images
    if (restaurant.hiddenImages && restaurant.hiddenImages.length > 0) {
        currentRestaurantMedia = currentRestaurantMedia.filter(img => !restaurant.hiddenImages.includes(img));
    }

    // Ensure we have at least one image (the cover photo)
    if (currentRestaurantMedia.length === 0 && restaurant.photo) {
        currentRestaurantMedia = [restaurant.photo];
    }

    currentSlideIndex = 0;

    const modal = document.getElementById('carouselModal');
    modal.classList.add('active');
    updateCarousel();
    setupCarouselDots();
}

function closeCarousel() {
    const modal = document.getElementById('carouselModal');
    modal.classList.remove('active');
}

function changeSlide(direction) {
    currentSlideIndex += direction;
    if (currentSlideIndex < 0) currentSlideIndex = currentRestaurantMedia.length - 1;
    if (currentSlideIndex >= currentRestaurantMedia.length) currentSlideIndex = 0;
    updateCarousel();
}

function goToSlide(index) {
    currentSlideIndex = index;
    updateCarousel();
}

function updateCarousel() {
    if (currentRestaurantMedia.length === 0) return;

    const mediaPath = currentRestaurantMedia[currentSlideIndex];
    const img = document.getElementById('carouselImage');
    const video = document.getElementById('carouselVideo');
    const caption = document.getElementById('carouselCaption');

    // Check if it's a video or image
    if (mediaPath.endsWith('.mp4') || mediaPath.endsWith('.mov')) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaPath;
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaPath;
    }

    caption.textContent = `${currentSlideIndex + 1} / ${currentRestaurantMedia.length}`;
    updateDots();
}

function setupCarouselDots() {
    const dotsContainer = document.getElementById('carouselDots');
    dotsContainer.innerHTML = '';

    currentRestaurantMedia.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.className = 'carousel-dot';
        dot.onclick = () => goToSlide(index);
        dotsContainer.appendChild(dot);
    });

    updateDots();
}

function updateDots() {
    const dots = document.querySelectorAll('.carousel-dot');
    dots.forEach((dot, index) => {
        if (index === currentSlideIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

// =========================================
// Event Listeners
// =========================================
function setupEventListeners() {

    // View toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            renderRestaurants();
        });
    });

    document.getElementById('adminToggle').addEventListener('click', () => {
        const panel = document.getElementById('adminPanel');
        panel.hidden = !panel.hidden;
    });

    document.getElementById('closeAdmin').addEventListener('click', () => {
        document.getElementById('adminPanel').hidden = true;
        resetForm();
    });

    document.getElementById('restaurantForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('resetForm').addEventListener('click', resetForm);

    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('change', importData);
    document.getElementById('resetData').addEventListener('click', resetData);

    // Keyboard navigation for carousel
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('carouselModal');
        if (modal.classList.contains('active')) {
            if (e.key === 'ArrowLeft') changeSlide(-1);
            if (e.key === 'ArrowRight') changeSlide(1);
            if (e.key === 'Escape') closeCarousel();
        }
    });
}

// =========================================
// Admin Panel / CMS Functions
// =========================================
function setupAdminPanel() {
    renderAdminList();
}

function renderAdminList() {
    const list = document.getElementById('adminList');
    list.innerHTML = '';


    // Combine all lists for admin view
    const allRestaurants = [...selectedPlaces, ...honorableMentions, ...hiddenRestaurants, ...dayToDayPlaces];

    allRestaurants.forEach((r, index) => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        // Escape single quotes for onclick
        const safeName = r.name.replace(/'/g, "\\'");

        // Determine category badge
        let categoryBadge = '';
        if (selectedPlaces.find(p => p.name === r.name)) categoryBadge = '⭐';
        else if (honorableMentions.find(p => p.name === r.name)) categoryBadge = '🏅';
        else if (hiddenRestaurants.find(p => p.name === r.name)) categoryBadge = '🔒';

        item.innerHTML = `
            <span>${categoryBadge} <strong>${r.name}</strong> - ${r.cuisine} - ${r.price}</span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="ghost-btn" onclick="editRestaurant('${safeName}')">Edit</button>
                <button class="ghost-btn danger" onclick="deleteRestaurant(${index})">Delete</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function editRestaurant(name) {
    const restaurant = selectedPlaces.find(r => r.name === name) ||
        honorableMentions.find(r => r.name === name) ||
        hiddenRestaurants.find(r => r.name === name) ||
        dayToDayPlaces.find(r => r.name === name);
    if (!restaurant) return;

    editingRestaurantName = name;

    document.getElementById('nameInput').value = restaurant.name;
    document.getElementById('cuisineInput').value = restaurant.cuisine;
    document.getElementById('priceInput').value = restaurant.price;
    document.getElementById('ratingInput').value = restaurant.rating;
    document.getElementById('locationInput').value = restaurant.location;
    document.getElementById('mapInput').value = restaurant.map || '';
    document.getElementById('photoInput').value = restaurant.photo || '';
    document.getElementById('descriptionInput').value = restaurant.description;
    document.getElementById('notesInput').value = restaurant.notes || '';

    // Set category
    let category = 'selected';
    if (honorableMentions.find(r => r.name === name)) category = 'honorable';
    else if (hiddenRestaurants.find(r => r.name === name)) category = 'hidden';
    document.getElementById('categoryInput').value = category;

    // Show image selector if available
    const sanitized = restaurant.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const media = mediaIndex[sanitized];

    const selector = document.getElementById('imageSelector');
    const grid = document.getElementById('selectorGrid');

    if (media && media.length > 0) {
        selector.style.display = 'block';
        grid.innerHTML = '';

        // Initialize hiddenImages if it doesn't exist
        if (!restaurant.hiddenImages) {
            restaurant.hiddenImages = [];
        }

        media.forEach(path => {
            const container = document.createElement('div');
            container.style.cssText = 'position: relative; display: inline-block; margin: 5px;';

            const img = document.createElement('img');
            img.src = path;
            img.className = 'selector-thumbnail';
            if (path === restaurant.photo) {
                img.classList.add('selected');
            }
            img.onclick = () => {
                document.querySelectorAll('.selector-thumbnail').forEach(t => t.classList.remove('selected'));
                img.classList.add('selected');
                document.getElementById('photoInput').value = path;
            };

            // Add checkbox for carousel visibility
            const checkboxContainer = document.createElement('div');
            checkboxContainer.style.cssText = 'position: absolute; top: 5px; left: 5px; background: rgba(255,255,255,0.9); padding: 2px 5px; border-radius: 3px; font-size: 11px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !restaurant.hiddenImages.includes(path);
            checkbox.title = 'Show in carousel';
            checkbox.style.cssText = 'margin-right: 3px;';
            checkbox.onclick = (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    // Remove from hidden
                    restaurant.hiddenImages = restaurant.hiddenImages.filter(p => p !== path);
                } else {
                    // Add to hidden
                    if (!restaurant.hiddenImages.includes(path)) {
                        restaurant.hiddenImages.push(path);
                    }
                }
                saveRestaurants();
            };

            const label = document.createElement('span');
            label.textContent = '📸';
            label.style.cursor = 'pointer';
            label.onclick = (e) => {
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                checkbox.onclick(e);
            };

            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(label);

            container.appendChild(img);
            container.appendChild(checkboxContainer);
            grid.appendChild(container);
        });
    } else {
        selector.style.display = 'none';
    }

    document.getElementById('adminPanel').hidden = false;
}

function deleteRestaurant(index) {
    if (confirm('Are you sure you want to delete this restaurant?')) {
        const allRestaurants = [...selectedPlaces, ...honorableMentions, ...hiddenRestaurants, ...dayToDayPlaces];
        const restaurant = allRestaurants[index];

        // Find and remove from the correct array
        const selectedIndex = selectedPlaces.findIndex(r => r.name === restaurant.name);
        if (selectedIndex !== -1) {
            selectedPlaces.splice(selectedIndex, 1);
        } else {
            const honorableIndex = honorableMentions.findIndex(r => r.name === restaurant.name);
            if (honorableIndex !== -1) {
                honorableMentions.splice(honorableIndex, 1);
            } else {
                const hiddenIndex = hiddenRestaurants.findIndex(r => r.name === restaurant.name);
                if (hiddenIndex !== -1) {
                    hiddenRestaurants.splice(hiddenIndex, 1);
                } else {
                    const dayToDayIndex = dayToDayPlaces.findIndex(r => r.name === restaurant.name);
                    if (dayToDayIndex !== -1) {
                        dayToDayPlaces.splice(dayToDayIndex, 1);
                    }
                }
            }
        }

        saveRestaurants();
        renderRestaurants();
        renderAdminList();
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('nameInput').value;
    const cuisine = document.getElementById('cuisineInput').value;
    const price = document.getElementById('priceInput').value;
    const rating = parseFloat(document.getElementById('ratingInput').value);
    const location = document.getElementById('locationInput').value;
    const map = document.getElementById('mapInput').value;
    const photo = document.getElementById('photoInput').value;
    const description = document.getElementById('descriptionInput').value;
    const notes = document.getElementById('notesInput').value;
    const category = document.getElementById('categoryInput').value;

    if (editingRestaurantName) {
        // Edit existing - find in all arrays
        const restaurant = selectedPlaces.find(r => r.name === editingRestaurantName) ||
            honorableMentions.find(r => r.name === editingRestaurantName) ||
            hiddenRestaurants.find(r => r.name === editingRestaurantName) ||
            dayToDayPlaces.find(r => r.name === editingRestaurantName);

        if (restaurant) {
            // Update restaurant data
            restaurant.name = name;
            restaurant.cuisine = cuisine;
            restaurant.price = price;
            restaurant.rating = rating;
            restaurant.location = location;
            restaurant.map = map;
            restaurant.photo = photo;
            restaurant.description = description;
            restaurant.notes = notes;

            // Handle category change - remove from old array and add to new
            const oldCategory = selectedPlaces.find(r => r.name === editingRestaurantName) ? 'selected' :
                honorableMentions.find(r => r.name === editingRestaurantName) ? 'honorable' :
                    hiddenRestaurants.find(r => r.name === editingRestaurantName) ? 'hidden' : 'everyday';

            if (oldCategory !== category) {
                // Remove from old array
                if (oldCategory === 'selected') {
                    const idx = selectedPlaces.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) selectedPlaces.splice(idx, 1);
                } else if (oldCategory === 'honorable') {
                    const idx = honorableMentions.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) honorableMentions.splice(idx, 1);
                } else if (oldCategory === 'hidden') {
                    const idx = hiddenRestaurants.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) hiddenRestaurants.splice(idx, 1);
                } else {
                    const idx = dayToDayPlaces.findIndex(r => r.name === editingRestaurantName);
                    if (idx !== -1) dayToDayPlaces.splice(idx, 1);
                }

                // Add to new array
                if (category === 'selected') {
                    selectedPlaces.push(restaurant);
                } else if (category === 'honorable') {
                    honorableMentions.push(restaurant);
                } else if (category === 'hidden') {
                    hiddenRestaurants.push(restaurant);
                }
            }
        }
    } else {
        // Add new restaurant to the selected category
        const newRestaurant = {
            name,
            cuisine,
            price,
            rating,
            description,
            location,
            notes,
            photo,
            map,
            lat: 0,
            lng: 0
        };

        if (category === 'selected') {
            selectedPlaces.push(newRestaurant);
        } else if (category === 'honorable') {
            honorableMentions.push(newRestaurant);
        } else if (category === 'hidden') {
            hiddenRestaurants.push(newRestaurant);
        } else {
            dayToDayPlaces.push(newRestaurant);
        }
    }

    saveRestaurants();
    renderRestaurants();
    renderAdminList();
    resetForm();
    document.getElementById('adminPanel').hidden = true;
}

function resetForm() {
    document.getElementById('restaurantForm').reset();
    document.getElementById('imageSelector').style.display = 'none';
    editingRestaurantName = null;
}

function exportData() {
    const data = {
        selectedPlaces,
        honorableMentions,
        dayToDayPlaces
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restaurants_export.json';
    a.click();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (imported.selectedPlaces && imported.honorableMentions && imported.dayToDayPlaces) {
                selectedPlaces = imported.selectedPlaces;
                honorableMentions = imported.honorableMentions;
                dayToDayPlaces = imported.dayToDayPlaces;
                saveRestaurants();
                renderRestaurants();
                renderAdminList();
                alert('Data imported successfully!');
            } else {
                alert('Invalid import format. Expected {selectedPlaces: [], honorableMentions: [], dayToDayPlaces: []}');
            }
        } catch (err) {
            alert('Error importing data: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function resetData() {
    if (confirm('This will reset all data to default. Are you sure?')) {
        localStorage.removeItem('food_rec_selected_places');
        localStorage.removeItem('food_rec_honorable_mentions');
        localStorage.removeItem('food_rec_day_to_day');
        localStorage.removeItem('food_rec_hidden_restaurants');
        // Reload from JSON files
        location.reload();
    }
}

// =========================================
// Storage Functions
// =========================================
function saveRestaurants() {
    try {
        localStorage.setItem('food_rec_selected_places', JSON.stringify(selectedPlaces));
        localStorage.setItem('food_rec_honorable_mentions', JSON.stringify(honorableMentions));
        localStorage.setItem('food_rec_day_to_day', JSON.stringify(dayToDayPlaces));
        localStorage.setItem('food_rec_hidden_restaurants', JSON.stringify(hiddenRestaurants));
    } catch (error) {
        console.warn('Unable to save restaurants', error);
    }
}

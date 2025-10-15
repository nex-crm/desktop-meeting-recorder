/**
 * Icon library matching web app's outlined stroke-based design
 * All icons use 16x16 viewBox with 1.4px stroke width
 * Based on @nex/ui-kit Icon components
 */

export const ICONS = {
  arrowLeft: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 12L3 7.5L7.5 3M4 7.5L13 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  arrowRight: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.5 12L13 7.5L8.5 3M12 7.5L3 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  search: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.66667 13.6667C10.9804 13.6667 13.6667 10.9804 13.6667 7.66667C13.6667 4.35304 10.9804 1.66667 7.66667 1.66667C4.35304 1.66667 1.66667 4.35304 1.66667 7.66667C1.66667 10.9804 4.35304 13.6667 7.66667 13.6667Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.3333 14.3333L12.7333 12.7333" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  mic: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10C9.10457 10 10 9.10457 10 8V3.5C10 2.39543 9.10457 1.5 8 1.5C6.89543 1.5 6 2.39543 6 3.5V8C6 9.10457 6.89543 10 8 10Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12.5 7V8C12.5 10.4853 10.4853 12.5 8 12.5C5.51472 12.5 3.5 10.4853 3.5 8V7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 12.5V14.5M8 14.5H6M8 14.5H10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  menu: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  chevronDown: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  chevronUp: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 10L8 6L4 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  chevronRight: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  time: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 4.5V8L10.5 9.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  note: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1.5H3.5C2.94772 1.5 2.5 1.94772 2.5 2.5V13.5C2.5 14.0523 2.94772 14.5 3.5 14.5H12.5C13.0523 14.5 13.5 14.0523 13.5 13.5V5.5L9.5 1.5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.5 1.5V5.5H13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  settings: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_settings)">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M5.45966 3.60001C4.87926 3.9351 4.20015 3.94012 3.64456 3.67272C3.19881 3.45819 2.53527 3.46526 2.28792 3.89368L1.54169 5.1862C1.29543 5.61272 1.61691 6.18437 2.02561 6.45918C2.5325 6.79999 2.86288 7.37773 2.85834 8.03525C2.85382 8.69045 2.51779 9.27099 2.00916 9.6192C1.61543 9.88875 1.32385 10.4365 1.56243 10.8497L2.31331 12.1503C2.55189 12.5635 3.17205 12.5849 3.60235 12.3787C4.15822 12.1123 4.829 12.1116 5.39869 12.4352C5.97037 12.7601 6.30552 13.3351 6.34724 13.9444C6.38088 14.4358 6.71521 15 7.2077 15H8.70014C9.19483 15 9.53273 14.4289 9.56982 13.9356C9.61604 13.3207 9.95994 12.7351 10.5403 12.4C11.1207 12.0649 11.7999 12.0599 12.3555 12.3273C12.8012 12.5418 13.4648 12.5348 13.7121 12.1064L14.4583 10.8139C14.7046 10.3874 14.3831 9.81571 13.9744 9.5409C13.4675 9.20008 13.1371 8.62234 13.1417 7.96483C13.1462 7.30961 13.4822 6.72906 13.9909 6.38085C14.3846 6.1113 14.6762 5.56353 14.4377 5.15029L13.6868 3.84974C13.4482 3.4365 12.828 3.41516 12.3977 3.62138C11.8418 3.88777 11.171 3.88852 10.6013 3.56483C10.0296 3.24 9.69449 2.665 9.65278 2.05561C9.61915 1.56425 9.28482 1 8.79231 1L7.29986 1C6.80516 1 6.46726 1.57113 6.43018 2.06443C6.38396 2.67929 6.04006 3.26491 5.45966 3.60001ZM8.00005 10.4249C9.33927 10.4249 10.4249 9.33921 10.4249 7.99999C10.4249 6.66077 9.33927 5.57512 8.00005 5.57512C6.66083 5.57512 5.57518 6.66077 5.57518 7.99999C5.57518 9.33921 6.66083 10.4249 8.00005 10.4249Z" stroke="currentColor" stroke-width="1.4"/>
      </g>
      <defs>
        <clipPath id="clip0_settings">
          <rect width="16" height="16" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  `,

  trash: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 4H3.33333H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.33334 4.00001V2.66668C5.33334 2.31305 5.47382 1.97391 5.72387 1.72387C5.97391 1.47382 6.31305 1.33334 6.66668 1.33334H9.33334C9.68697 1.33334 10.0261 1.47382 10.2762 1.72387C10.5262 1.97391 10.6667 2.31305 10.6667 2.66668V4.00001M12.6667 4.00001V13.3333C12.6667 13.687 12.5262 14.0261 12.2762 14.2762C12.0261 14.5262 11.687 14.6667 11.3333 14.6667H4.66668C4.31305 14.6667 3.97391 14.5262 3.72387 14.2762C3.47382 14.0261 3.33334 13.687 3.33334 13.3333V4.00001H12.6667Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  refresh: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.6667 2.66667V6.66667H9.66667" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2.33334 13.3333V9.33333H6.33334" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3.41334 6.00001C3.70219 5.12942 4.20504 4.34469 4.87334 3.71668C5.54165 3.08866 6.35363 2.63697 7.23776 2.40174C8.12188 2.16651 9.05016 2.15483 9.93979 2.36775C10.8294 2.58067 11.6529 3.01159 12.3333 3.62001L13.6667 6.66668M2.33334 9.33334L3.66668 12.38C4.34708 12.9884 5.17057 13.4193 6.06021 13.6323C6.94984 13.8452 7.87812 13.8335 8.76224 13.5983C9.64637 13.363 10.4583 12.9114 11.1267 12.2833C11.795 11.6553 12.2978 10.8706 12.5867 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  user: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.3333 14V12.6667C13.3333 11.9594 13.0524 11.2811 12.5523 10.781C12.0522 10.281 11.3739 10 10.6667 10H5.33333C4.62609 10 3.94781 10.281 3.44772 10.781C2.94762 11.2811 2.66667 11.9594 2.66667 12.6667V14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 7.33333C9.47276 7.33333 10.6667 6.13943 10.6667 4.66667C10.6667 3.19391 9.47276 2 8 2C6.52724 2 5.33333 3.19391 5.33333 4.66667C5.33333 6.13943 6.52724 7.33333 8 7.33333Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  plus: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3.33334V12.6667M3.33334 8H12.6667" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  x: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  check: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  calendar: `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.6667 2.66667H3.33334C2.59696 2.66667 2.00001 3.26362 2.00001 4V13.3333C2.00001 14.0697 2.59696 14.6667 3.33334 14.6667H12.6667C13.403 14.6667 14 14.0697 14 13.3333V4C14 3.26362 13.403 2.66667 12.6667 2.66667Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.6667 1.33333V4M5.33334 1.33333V4M2 6.66667H14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
};

/**
 * Helper function to create an icon element
 * @param {string} iconName - Key from ICONS object
 * @param {string} className - Optional CSS classes
 * @returns {HTMLElement} Icon element
 */
export function createIcon(iconName, className = '') {
  const wrapper = document.createElement('span');
  wrapper.className = className;
  wrapper.innerHTML = ICONS[iconName] || ICONS.note;
  return wrapper.firstElementChild;
}

/**
 * Replace an existing icon in the DOM
 * @param {HTMLElement} oldIcon - Old icon element to replace
 * @param {string} iconName - New icon name from ICONS
 */
export function replaceIcon(oldIcon, iconName) {
  const newIcon = createIcon(iconName, oldIcon.className);
  oldIcon.parentNode.replaceChild(newIcon, oldIcon);
}

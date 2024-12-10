import board
import neopixel
import wifi
import socketpool
import adafruit_httpserver
import time
from secrets import secrets


# Configure your LED strip
NUM_PIXELS = 300
pixels = neopixel.NeoPixel(board.D6, NUM_PIXELS, brightness=0.5, auto_write=False)

# WiFi credentials - replace with your network details
WIFI_SSID = secrets['ssid']
WIFI_PASSWORD = secrets['password']

animation_active = False
current_pattern = None

# Separate pattern variables
xmasfade_vars = {
    "step_duration": 0.02,
    "steps": 20,
    "hold_duration": 3.0
}

xmasswitch_vars = {
    "step_duration": 0.01,
    "steps": 30,
    "hold_duration": 3.0
}

def start_server():
    # Connect to WiFi
    print("Connecting to WiFi...")
    wifi.radio.connect(WIFI_SSID, WIFI_PASSWORD)
    print("Connected to WiFi!")
    print("My IP address:", wifi.radio.ipv4_address)

    # Create socket pool and HTTP server
    pool = socketpool.SocketPool(wifi.radio)
    server = adafruit_httpserver.Server(pool)

    @server.route("/styles.css")
    def styles(request):
        """Serve the CSS file"""
        try:
            with open("/www/styles.css", "r") as f:
                css_content = f.read()
            return adafruit_httpserver.Response(request=request, body=css_content, content_type="text/css")
        except Exception as e:
            print(f"Error reading styles.css: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)

    @server.route("/index.js")
    def script(request):
        """Serve the JavaScript file"""
        try:
            with open("/www/index.js", "r") as f:
                js_content = f.read()
            return adafruit_httpserver.Response(request=request, body=js_content, content_type="text/javascript")
        except Exception as e:
            print(f"Error reading index.js: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)

    @server.route("/")
    def base(request):
        """Serve the index.html file"""
        print("Received request for /")
        try:
            with open("/www/index.html", "r") as f:
                html_content = f.read()
            print("Successfully read index.html")
            response = adafruit_httpserver.Response(request=request, body=html_content, content_type="text/html")
            return response
        except Exception as e:
            print(f"Error reading index.html: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)

    @server.route("/color/<color>", methods=["POST"])
    def set_color(request, color: str):
        """Handle color change requests"""
        print(f"Received color request: {color}")
        global animation_active
        try:
            if color == "red":
                animation_active = False
                pixels.fill((255, 0, 0))
                pixels.show()
            elif color == "green":
                animation_active = False
                pixels.fill((0, 255, 0))
                pixels.show()
            elif color == "blue":
                animation_active = False
                pixels.fill((0, 0, 255))
                pixels.show()
            elif color == "off":
                animation_active = False
                pixels.fill((0, 0, 0))
                pixels.show()
            return adafruit_httpserver.Response(request=request, body="Color set")
        except Exception as e:
            print(f"Error setting color: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)
        
    @server.route("/pattern/<pattern>", methods=["POST"])
    def set_pattern(request, pattern: str):
        global animation_active, current_pattern
        try:
            if pattern == "xmasfade":
                current_pattern = "xmasfade"
                animation_active = not animation_active
                return adafruit_httpserver.Response(request=request, body="Pattern toggled")
            elif pattern == "xmasswitch":
                current_pattern = "xmasswitch"
                animation_active = not animation_active
                # Set initial alternating pattern with red on odd LEDs
                for i in range(NUM_PIXELS):
                    if i % 2 == 1:  # Odd LEDs red
                        pixels[i] = (255, 0, 0)
                    else:  # Even LEDs off
                        pixels[i] = (0, 0, 0)
                return adafruit_httpserver.Response(request=request, body="Pattern toggled")
        except Exception as e:
            print(f"Error setting pattern: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)

    @server.route("/brightness/<brightness>", methods=["POST"])
    def set_brightness(request, brightness: str):
        """Handle brightness change requests"""
        try:
            # Convert string to float and clamp between 0 and 1
            brightness_value = min(max(float(brightness), 0.0), 1.0)
            pixels.brightness = brightness_value
            return adafruit_httpserver.Response(request=request, body="Brightness set")
        except Exception as e:
            print(f"Error setting brightness: {e}")
            return adafruit_httpserver.Response(request=request, body=str(e), status=500)

    try:
        print("Starting server...")
        server.start(str(wifi.radio.ipv4_address), 8080)
        print(f"Server started on http://{wifi.radio.ipv4_address}:8080")
        return server
    except Exception as e:
        print(f"Failed to start server: {e}")
        return None
    
def main():
    try:
        server = start_server()
        if server is not None:
            print("Server started successfully!")
            
            # Shared animation state variables
            last_animation_step = time.monotonic()
            current_step = 0
            going_to_green = True
            holding = False
            hold_start = time.monotonic()
            
            while True:
                server.poll()
                
                if animation_active:
                    current_time = time.monotonic()
                    
                    # Select the appropriate pattern logic
                    if current_pattern == "xmasfade":
                        # Original xmasfade logic
                        if holding:
                            if current_time - hold_start >= xmasfade_vars["hold_duration"]:
                                holding = False
                                current_step = 0
                                going_to_green = not going_to_green
                        else:
                            if current_time - last_animation_step >= xmasfade_vars["step_duration"]:
                                progress = current_step / xmasfade_vars["steps"]
                                adjusted_progress = progress * progress * (3 - 2 * progress)
                                
                                if going_to_green:
                                    red = int(255 * (1 - adjusted_progress))
                                    green = int(255 * (adjusted_progress ** 0.8))
                                else:
                                    red = int(255 * adjusted_progress)
                                    green = int(255 * ((1 - adjusted_progress) ** 0.8))
                                pixels.fill((red, green, 0))
                                pixels.show()
                                
                                current_step += 1
                                last_animation_step = current_time
                                
                                if current_step >= xmasfade_vars["steps"]:
                                    holding = True
                                    hold_start = current_time
                                    current_step = 0
                                    going_to_green = not going_to_green
                    
                    elif current_pattern == "xmasswitch":
                        if holding:
                            if current_time - hold_start >= xmasswitch_vars["hold_duration"]:
                                holding = False
                                current_step = 0
                                going_to_green = not going_to_green
                        else:
                            if current_time - last_animation_step >= xmasswitch_vars["step_duration"]:
                                linear_progress = current_step / xmasswitch_vars["steps"]
                                progress = linear_progress * linear_progress * (3 - 2 * linear_progress)
                                intensity_out = int(255 * (1 - progress))
                                intensity_in = int(255 * progress)
                                
                                for i in range(NUM_PIXELS):
                                    if going_to_green:
                                        if i % 2 == 1:
                                            pixels[i] = (intensity_out, 0, 0)
                                        elif i % 2 == 0:
                                            pixels[i] = (0, intensity_in, 0)
                                    else:
                                        if i % 2 == 0:
                                            pixels[i] = (0, intensity_out, 0)
                                        elif i % 2 == 1:
                                            pixels[i] = (intensity_in, 0, 0)
                                
                                pixels.show()  # Add this
                                current_step += 1
                                last_animation_step = current_time
                                
                                if current_step >= xmasswitch_vars["steps"]:
                                    holding = True
                                    hold_start = current_time
                                    current_step = 0
    except Exception as e:
        print(f"Error in main loop: {e}")
        # Turn off all pixels in case of error
        pixels.fill((0, 0, 0))
    finally:
        print("Exiting main loop")
        pixels.fill((0, 0, 0))

# Main program
while True:
    main()
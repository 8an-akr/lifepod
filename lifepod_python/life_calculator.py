import tkinter as tk

def on_button_press(button):
    # You'd add functionality for what happens when a button is pressed
    print(f"Button {button} pressed.")

root = tk.Tk()
root.title("Game of Life Simulator")

# Define main display
main_display = tk.Label(root, text="", width=20, height=10, bg="lightgrey")
main_display.grid(row=1, column=1, columnspan=3)

# Define buttons
buttons = {
    "0": {"row": 2, "column": 0},
    "1": {"row": 0, "column": 1, "text": "LOTTERY"},
    "2": {"row": 0, "column": 2, "text": "CHANCE"},
    "3": {"row": 0, "column": 3, "text": "MARRIAGE"},
    "4": {"row": 1, "column": 4, "text": "+"},
    "5": {"row": 2, "column": 3, "text": "HOUSE"},
    "6": {"row": 2, "column": 2, "text": "CAR"},
    "7": {"row": 2, "column": 1, "text": "BABY"},
    "8": {"row": 2, "column": 0, "text": "VOLUME"},
    "9": {"row": 1, "column": 0},
    "10": {"row": 0, "column": 0, "text": "YEARS"},
    "SALARY": {"row": 1, "column": 1},
    "ENTER": {"row": 1, "column": 2},
    "SPIN": {"row": 1, "column": 3},
    "UNDO": {"row": 1, "column": 2, "text": "UNDO"}
}

for button, info in buttons.items():
    text = info.get("text", button)
    btn = tk.Button(root, text=text, command=lambda b=button: on_button_press(b))
    btn.grid(row=info["row"], column=info["column"], sticky="nsew")

root.mainloop()

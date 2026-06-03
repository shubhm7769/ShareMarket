import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

def main():
    print("Testing matplotlib figure generation...")
    os.makedirs('generated_charts', exist_ok=True)
    
    fig, ax = plt.subplots(figsize=(6, 4))
    x = np.linspace(0, 10, 100)
    y = np.sin(x)
    ax.plot(x, y, label='Sine Wave', color='#0ea5e9')
    ax.set_title("Test Plot", color='#f1f5f9')
    ax.set_facecolor('#0b1221')
    fig.patch.set_facecolor('#040914')
    ax.grid(color='#ffffff', alpha=0.05)
    ax.tick_params(colors='#94a3b8')
    ax.legend(facecolor='#0b1221', edgecolor='#ffffff', framealpha=0.1)
    
    output_path = os.path.join('generated_charts', 'test_plot.png')
    plt.savefig(output_path, dpi=100, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
    plt.close()
    
    print(f"Chart saved successfully at {output_path}")

if __name__ == '__main__':
    main()

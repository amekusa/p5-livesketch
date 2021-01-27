var sketch = p => {

  p.setup = () => {
    p.createCanvas(400, 400);
  };

  p.draw = () => {
    p.background(220);
  };

};

new p5(sketch, document.getElementById('p5-container'));

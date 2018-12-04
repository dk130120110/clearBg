const { windowWidth } = wx.getSystemInfoSync();
const ratio = windowWidth / 750;

const page = {
  data: {
    img: 'https://timgsa.baidu.com/timg?image&quality=80&size=b9999_10000&sec=1543903832813&di=becbe8f31b9b274acb7327a60e776869&imgtype=0&src=http%3A%2F%2Fwww.17qq.com%2Fimg_biaoqing%2F76421649.jpeg',
    // img: 'https://timgsa.baidu.com/timg?image&quality=80&size=b9999_10000&sec=1543558958933&di=a176aa6ab2c10b55199c788240a72605&imgtype=0&src=http%3A%2F%2Fwww.17qq.com%2Fimg_biaoqing%2F76460929.jpeg',
    width: 240, // canvas大小，单位px
    height: 240,
    id: 'canvas', // 画布id
    time: 3, // 遍历次数，次数越大，细节部位清除越干净，但性能越差
    rubber: false, // 是否开启橡皮刷
    paint: false, // 是否开启涂抹
    rgb: 200, // 色值区间(200-256)，因为有些白中有点暗的颜色也是需要清除掉的，例如#f0f0f0
    dataGroup: [], // 存储数据用于撤回
    latest: true, // 当前画布是否为最新操作
    clear: false, // 防止连点，去白底性能消耗大，连点会闪退
    ratio,
  },
  onLoad() {
    const { img, width, height, id } = this.data;
    wx.getImageInfo({
      src: img,
      success: (res) => {
        const { path } = res;
        const ctx = wx.createCanvasContext(id);
        ctx.drawImage(path, 0, 0, width, height);
        ctx.draw(false, () => {
          const query = wx.createSelectorQuery()
          query.select(`#${id}`).boundingClientRect()
          query.exec((res) => {
            const { left, top } = res[0];
            // 存储坐标并把原图存进撤回用的数组
            this.setData({ left, top, ctx, dataGroup: [path] });
          })
        });
      }
    })
  },
  // 去白底
  clearWhite() {
    wx.showLoading({ title: '处理中', mask: true });
    const { width, height, time, id } = this.data;
    this.setData({ clear: true }, () => {
      wx.canvasGetImageData({
        canvasId: id,
        x: 0,
        y: 0,
        width,
        height,
        success: (res) => {
          let { data } = res;
          // 遇到非白色时转下一行，width * 4 ？ please tell me why ？
          for (let i = 0; i < data.length; i += (width * 4)){
            for (let j = i; j < i + (width * 4); j+=4){
              const res = this.diffuse(data, j);
              if (!res) break;
            }
          }
          // 根据定义的次数开始上下其手
          for (let i = 0; i < time; i++){
            this.clearBg(data);
          }
          // 画图
          this.drawCanvas(id, data, 0, 0, width, height, () => {
            this.saveData();
            this.setData({ clear: false });
            wx.hideLoading();
          });
        }
      })
    })
  },
  clearBg(data){
    const { width } = this.data;
    // 正向操作
    for (let i = 0; i < data.length; i += (width * 4)){
      for (let j = i; j < i + (width * 4); j+=4){
          this.cross(data, j);
          this.vertical(data, j);
      }
    }
    // 反向操作一波
    data.reverse();
    for (let i = 0; i < data.length; i += (width * 4)){
      for (let j = i - 3; j < i + (width * 4); j+=4){
        this.cross(data, j);
        this.vertical(data, j);
      }
    }
    // 转回来
    data.reverse();
  },
  diffuse(data, i) {
    const { rgb } = this.data;
    const a = data[i+3];
    if (!a) return true;
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    if ([r,g,b].every(v => v < 256 && v > rgb)) {
      data[i+3] = 0;
    } else {
      return false;
    }
    return true;
  },
  // 横向
  cross(data, i) {
    const { rgb } = this.data;
    const a = data[i+3];
    const nextr = data[i+4];
    const nextg = data[i+5];
    const nextb = data[i+6];
    const nexta = data[i+7];
    if (a === 0 && [nextr,nextg,nextb].every(v => v < 256 && v > rgb) && nexta !== 0) {
      data[i+7] = 0;
    }
  },
  // 竖向
  vertical(data, i) {
    const { width, rgb } = this.data;
    const a = data[i+3];
    const nextr = data[i+width*4];
    const nextg = data[i+width*4+1];
    const nextb = data[i+width*4+2];
    const nexta = data[i+width*4+3];
    if (a === 0 && [nextr,nextg,nextb].every(v => v < 256 && v > rgb) && nexta !== 0) {
      data[i+width*4+3] = 0;
    }
  },
  touchstart(){
    // 不写这个函数会出现touchmove有延迟
  },
  touchmove(e) {
    const { left, top, ctx, rubber, paint, id, rgb } = this.data;
    const { pageX, pageY } = e.touches[0];
    // 橡皮擦
    rubber && ctx.clearRect(pageX - left - 5, pageY - top - 5, 10, 10);
    rubber && ctx.draw(true);
    // 涂抹
    paint && wx.canvasGetImageData({
      canvasId: id,
      x: pageX - left - 5,
      y: pageY - top - 5,
      width: 10,
      height: 10,
      success: (res) => {
        const { data } = res;
        for (let i = 0; i < data.length; i+=4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          if ([r,g,b].every(v => v < 256 && v > rgb)) data[i+3] = 0;
        }
        // 画图
        this.drawCanvas(id, data, pageX - left - 5, pageY - top - 5, 10, 10);
      }
    });
  },
  // 操作完存储图片信息
  touchend(e) {
    this.saveData();
  },
  // 撤回
  back() {
    const { width, height, dataGroup, ctx, latest } = this.data;
    // 由于每次操作都有记录，因此当为最新操作并执行撤回时，要出栈两次，而连续撤回时只需出栈一次
    latest && dataGroup.pop();
    const data = dataGroup.length === 1 ? dataGroup[0] : dataGroup.pop();
    ctx.drawImage(data, 0, 0, width, height);
    ctx.draw();
    this.setData({ dataGroup, latest: false });
  },
  // 保存画布信息
  saveData() {
    const { id } = this.data;
    // keng，https://github.com/Kujiale-Mobile/MP-Keng canvas篇中第一条，并采用其方法，加上300ms延迟，目前测试没有问题
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvasId: id,
        success: (res) => {
          const  { tempFilePath } = res;
          const { dataGroup } = this.data;
          dataGroup.push(tempFilePath);
          this.setData({ dataGroup })
        }
      })
    }, 300);
    // 每次保存信息都将状态更新为最新操作
    this.setData({ latest: true });
  },
  // 画图
  drawCanvas(canvasId, data, x, y, width, height, cb) {
    wx.canvasPutImageData({
      canvasId,
      data,
      x,
      y,
      width,
      height,
      success: () => {
        cb && cb();
      }
    })
  },
  rubber() {
    this.setData({ rubber: !this.data.rubber, paint: false });
  },
  paint() {
    this.setData({ paint: !this.data.paint, rubber: false });
  },
  export() {
    const { id } = this.data;
    wx.canvasToTempFilePath({
      canvasId: id,
      success: (res) => {
        // 最终导出的图片
        const { tempFilePath } = res;
        console.log(tempFilePath);
        this.setData({ img: tempFilePath });
      }
    })
  },
}

Page(page);

import * as echarts from 'echarts';
import {buildChartOption} from './chart-options';
import type {ChartSettings} from './chart-settings';
import type {TableData} from './data';
import type {ImageTheme} from './export-theme';

// Render independently of the dock's dimensions and the screen's color profile.
export function chartPNG(table:TableData,type:string,settings:ChartSettings,theme:ImageTheme):string {
  const host=document.createElement('div'),width=800,height=540;
  const chart=echarts.init(host,undefined,{renderer:'canvas',width,height});
  try {
    const option=buildChartOption(table,type,settings,theme);
    if(option.xAxis&&option.yAxis) {
      const adjust=(axis:any,horizontal:boolean)=>({...axis,nameGap:horizontal?38:62,
        nameTextStyle:{...axis.nameTextStyle,fontSize:14,width:horizontal?width-160:height-180,overflow:'break',lineHeight:18},
        axisLabel:{...axis.axisLabel,fontSize:12,hideOverlap:true}});
      option.xAxis=Array.isArray(option.xAxis)?option.xAxis.map((a:any)=>adjust(a,true)):adjust(option.xAxis,true);
      option.yAxis=Array.isArray(option.yAxis)?option.yAxis.map((a:any)=>adjust(a,false)):adjust(option.yAxis,false);
      option.grid={...option.grid,left:100,top:35,bottom:110,right:Array.isArray(option.yAxis)?100:40,containLabel:true};
    }
    if(option.legend)option.legend={...option.legend,bottom:12,textStyle:{...option.legend.textStyle,fontSize:12}};
    chart.setOption(option,true);
    return chart.getDataURL({type:'png',pixelRatio:1.5});
  } finally {chart.dispose();}
}

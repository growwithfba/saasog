const CustomIcon = ({ color, icon }: { color: string, icon: React.ReactNode }) => {
    return (
      <div className="flex justify-center items-center">
        <div 
          className={`w-8 h-8 ${color} flex justify-center items-center`}
          style={{
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
          }}
        >
          {icon}
        </div>
      </div>
    );
  };

  export default CustomIcon;